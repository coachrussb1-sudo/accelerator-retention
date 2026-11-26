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

  it("still reads a Meta CSV plus screenshot when mime types are blank", async () => {
    const image = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", { type: "" });
    const csv = new File([EXAMPLE_CSV], "insights.csv", { type: "" });
    const result = await runPipeline([image, csv]);
    expect(result.error).toBeNull();
    expect(result.csv?.kind).toBe("meta_business_suite");
    expect(["screenshot", "csv"]).toContain(result.breakdown.curveSource);
    expect(result.breakdown.duration).toBeGreaterThan(0);
  });
});
