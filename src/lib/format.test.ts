import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatDay, formatMonth } from "./format";

describe("formatDate", () => {
  it("uses one format per locale: long in Korean, medium in English", () => {
    expect(formatDate("2026-04-23", "ko")).toBe("2026년 4월 23일");
    expect(formatDate("2026-04-23", "en")).toBe("Apr 23, 2026");
  });

  it("reads the day in UTC and passes a missing date through", () => {
    expect(formatDate("2026-01-01", "en")).toBe("Jan 1, 2026");
    expect(formatDate(null, "ko")).toBeNull();
  });
});

describe("formatMonth and formatDay", () => {
  it("split the date into a month heading and a day-only row label", () => {
    expect(formatMonth("2026-04", "ko")).toBe("2026년 4월");
    expect(formatMonth("2026-04", "en")).toBe("April 2026");
    expect(formatDay("2026-04-03", "ko")).toBe("3일");
    expect(formatDay("2026-04-03", "en")).toBe("3");
  });

  it("read the date in UTC", () => {
    expect(formatMonth("2026-01", "en")).toBe("January 2026");
    expect(formatDay("2026-01-31", "en")).toBe("31");
  });
});

describe("formatBytes", () => {
  it("keeps one decimal below 10 and none above", () => {
    for (const locale of ["ko", "en"]) {
      expect(formatBytes(2.3e9, locale)).toBe("2.3 GB");
      expect(formatBytes(1.2e10, locale)).toBe("12 GB");
    }
    expect(formatBytes(950e6, "en")).toBe("950 MB");
  });

  it("returns null for an unknown size", () => {
    expect(formatBytes(null, "en")).toBeNull();
    expect(formatBytes(0, "en")).toBeNull();
  });
});
