import { describe, expect, it } from "vitest";
import { parseEnglishDay } from "./dates";

describe("parseEnglishDay", () => {
  it("reads day-first and month-first dates as UTC days", () => {
    expect(parseEnglishDay("8 October, 2026")).toBe("2026-10-08");
    expect(parseEnglishDay("04 September, 2024")).toBe("2024-09-04");
    expect(parseEnglishDay("1st February 2026")).toBe("2026-02-01");
    expect(parseEnglishDay("1st December, 2014")).toBe("2014-12-01");
    expect(parseEnglishDay("June 1, 2026")).toBe("2026-06-01");
    expect(parseEnglishDay("Oct 8 2026")).toBe("2026-10-08");
  });

  it("ignores what follows the date", () => {
    expect(parseEnglishDay("1st February 2028 (End of Support June 2031)")).toBe("2028-02-01");
  });

  it("returns null for anything that is not a real date at the start", () => {
    expect(parseEnglishDay("No release required")).toBeNull();
    expect(parseEnglishDay("31 June 2026")).toBeNull();
    expect(parseEnglishDay("August 2030")).toBeNull();
    expect(parseEnglishDay("")).toBeNull();
    expect(parseEnglishDay("Released: June 1, 2026")).toBeNull();
  });
});
