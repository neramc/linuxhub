import { describe, expect, it } from "vitest";
import { splitAround, useTranslations } from "./index";

describe("splitAround", () => {
  it("splits a message around its placeholder, in either word order", () => {
    expect(splitAround(useTranslations("ko")("facts.reviewed"), "date")).toEqual([
      "정보 검토 ",
      "",
    ]);
    expect(splitAround(useTranslations("en")("home.popular.basis"), "day")).toEqual([
      "By English Wikipedia pageviews ",
      "",
    ]);
    expect(splitAround(useTranslations("ko")("home.popular.basis"), "day")).toEqual([
      "",
      " 영어 위키백과 조회수 기준",
    ]);
  });

  it("puts the whole message first when the placeholder is missing", () => {
    expect(splitAround("No date here", "date")).toEqual(["No date here", ""]);
  });
});
