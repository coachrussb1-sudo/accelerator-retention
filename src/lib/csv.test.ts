import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLE_CSV } from "./pipeline";
import { parseInsightsCsv, pickRow } from "./csv";

describe("insights csv", () => {
  it("reads Content Score Meta Business Suite headers", () => {
    const parsed = parseInsightsCsv(EXAMPLE_CSV, "sample-meta-business-suite-content.csv");
    expect(parsed.kind).toBe("meta_business_suite");
    expect(parsed.rows.length).toBeGreaterThanOrEqual(2);
    const picked = pickRow(parsed.rows, 42);
    expect(picked?.duration).toBe(42);
    expect(picked?.avgWatch).toBe(14.2);
    expect(picked?.skipRate).toBe(38);
  });

  it("reads the original Content Score fixture shape", () => {
    const text = readFileSync(new URL("../../public/fixtures/sample-meta-business-suite-content.csv", import.meta.url), "utf8");
    const parsed = parseInsightsCsv(text, "sample-meta-business-suite-content.csv");
    expect(parsed.kind).toBe("meta_business_suite");
    expect(parsed.picked?.caption.toLowerCase()).toMatch(/sale|method|leak|dms/);
    expect(parsed.picked?.reach ?? parsed.picked?.views).toBeGreaterThan(1000);
  });

  it("detects YouTube Studio headers", () => {
    const parsed = parseInsightsCsv(
      `Video title,Video length (seconds),Views,Average view duration
How to export,42,12000,0:14
Other,18,400,0:06
`,
    );
    expect(parsed.kind).toBe("youtube_studio");
    expect(pickRow(parsed.rows, 42)?.avgWatch).toBe(14);
  });

  it("detects TikTok headers", () => {
    const parsed = parseInsightsCsv(
      `Video,Total views,Average watch time,Full video watched rate
export howto,15000,14.2,0.11
`,
    );
    expect(parsed.kind).toBe("tiktok");
    expect(parsed.picked?.avgWatch).toBe(14.2);
  });
});
