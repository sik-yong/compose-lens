import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/index.js";

describe("LIMITS", () => {
  it("matches the values documented in PRD §8.3 and the support matrix", () => {
    expect(LIMITS).toEqual({
      maxInputBytes: 1_048_576,
      maxAliasCount: 100,
      maxDepth: 64,
      maxServices: 300,
      maxGraphElements: 3000,
    });
  });
});
