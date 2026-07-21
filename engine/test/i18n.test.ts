import { describe, it, expect } from "vitest";
import { TABLES, t } from "../src/report/i18n";

describe("i18n", () => {
  it("has identical key sets in en and de", () => {
    const en = Object.keys(TABLES.en).sort();
    const de = Object.keys(TABLES.de).sort();
    expect(de).toEqual(en);
  });
  it("resolves a key per language", () => {
    expect(t("en", "gate2.name")).toMatch(/Architecture/);
    expect(t("de", "gate2.name")).toMatch(/Architektur/);
  });
  it("throws on a missing key", () => {
    expect(() => t("en", "nope.nope")).toThrow(/missing i18n key/);
  });
});
