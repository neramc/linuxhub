import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, splitStatements, type TestContext } from "./harness";

describe("splitStatements", () => {
	it("strips line comments before splitting, so a ';' in one cannot split a statement", () => {
		const sql = "-- a comment; with a semicolon\nCREATE TABLE t (id INTEGER);\n";
		expect(splitStatements(sql)).toEqual(["CREATE TABLE t (id INTEGER)"]);
	});
});

describe("migrations applied to a real D1", () => {
	let ctx: TestContext;
	beforeAll(async () => {
		ctx = await createTestContext();
	});
	afterAll(() => ctx.dispose());

	it("creates every table in .ai/database.md", async () => {
		const { results } = await ctx.env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
		).all<{ name: string }>();
		const names = results.map((r) => r.name).sort();
		expect(names).toEqual([
			"artifact_mirrors",
			"artifacts",
			"categories",
			"content_index",
			"distro_taxonomy",
			"distros",
			"download_events",
			"editions",
			"hall_of_fame",
			"ingest_log",
			"mirrors",
			"rankings",
			"releases",
			"submissions",
			"tags",
		]);
	});

	it("enforces the closed-enum CHECK constraints", async () => {
		await expect(
			ctx.env.DB.prepare(
				`INSERT INTO distros (slug, name, homepage, logo_path, status, created_at, updated_at)
				 VALUES ('x', 'X', 'https://x', '/x.svg', 'bogus', 't', 't')`,
			).run(),
		).rejects.toThrow(/CHECK constraint/i);
	});

	it("rejects a release channel of 'eol', because eol is derived not stored", async () => {
		await ctx.env.DB.prepare(
			`INSERT INTO distros (slug, name, homepage, logo_path, created_at, updated_at)
			 VALUES ('d', 'D', 'https://d', '/d.svg', 't', 't')`,
		).run();
		await expect(
			ctx.env.DB.prepare(
				`INSERT INTO releases (distro_id, version, channel)
				 VALUES ((SELECT id FROM distros WHERE slug='d'), '1', 'eol')`,
			).run(),
		).rejects.toThrow(/CHECK constraint/i);
	});
});
