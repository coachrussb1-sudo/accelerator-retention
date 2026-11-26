import { describe, expect, it } from "vitest";
import { EXAMPLE_CSV, runPipeline } from "./pipeline";

describe("auto pipeline", () => {
  it("estimates a curve from a Meta CSV when there is no screenshot", async () => {
    const file = new File([EXAMPLE_CSV], "sample-meta-business-suite-content.csv", { type: "text/csv" });
    const result = await runPipeline([file]);
    expect(result.error).toBeNull();
    expect(result.breakdown.curveSource).toBe("csv");
    expect(result.breakdown.curveLabel).toMatch(/avg watch time/i);
    expect(result.breakdown.sections.some((s) => s.kind === "hook")).toBe(true);
    expect(result.breakdown.score).toBeGreaterThan(0);
  });
});
