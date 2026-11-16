import { describe, expectTypeOf, it } from "vitest";
import type { Diagnostic, DiagnosticLocation } from "../src/index.js";

describe("Diagnostic", () => {
  it("requires a location with a path or a line and column", () => {
    expectTypeOf<{ path: [] }>().toExtend<DiagnosticLocation>();
    expectTypeOf<{ line: 1; column: 1 }>().toExtend<DiagnosticLocation>();
    expectTypeOf<{ path: ["services"]; line: 3; column: 1 }>().toExtend<DiagnosticLocation>();
    expectTypeOf<{}>().not.toExtend<DiagnosticLocation>();
    expectTypeOf<{ line: 1 }>().not.toExtend<DiagnosticLocation>();
    expectTypeOf<Diagnostic>().toHaveProperty("location").toEqualTypeOf<DiagnosticLocation>();
  });
});
