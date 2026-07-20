// engine/test/smoke.test.ts
import { describe, it, expect } from "vitest";
import { engineName } from "../src/index";
describe("scaffold", () => {
  it("exposes the engine name", () => {
    expect(engineName()).toBe("review-engine");
  });
});
