import { describe, expect, it } from "vitest";
import {
  EXAMPLE_POINTS,
  acceleratorScore,
  analyzeSections,
  autoSections,
  buildBreakdown,
  interpolate,
  maxDropInWindow,
} from "./retention";

describe("retention breakdown", () => {
  it("reads 62% at 3s on the example curve", () => {
    expect(Math.round(interpolate(EXAMPLE_POINTS, 3))).toBe(62);
  });

  it("flags a 2s cliff around the 80% mark on the example", () => {
    const drop = maxDropInWindow(EXAMPLE_POINTS, 31, 34, 2);
    expect(drop).toBeGreaterThanOrEqual(12);
  });

  it("labels a weak hook and a missed CTA on example data", () => {
    const sections = autoSections(42);
    const reports = analyzeSections(EXAMPLE_POINTS, sections);
    const hook = reports.find((s) => s.kind === "hook");
    const cta = reports.find((s) => s.kind === "cta");
    expect(hook?.verdict).toBe("WEAK");
    expect(hook?.combo).toContain("HOOK");
    expect(cta?.combo).toMatch(/CTA/);
    expect(hook?.reason.toLowerCase()).toMatch(/open on the result/);
  });

  it("scores the example in a coaching range, not a fake 100", () => {
    const breakdown = buildBreakdown(EXAMPLE_POINTS, autoSections(42), true, 42);
    expect(breakdown.score).toBeGreaterThan(20);
    expect(breakdown.score).toBeLessThan(80);
    expect(breakdown.topFixes.length).toBeGreaterThan(0);
    expect(breakdown.topFixes.length).toBeLessThanOrEqual(3);
  });

  it("uses a stronger 3s hold as a better hook", () => {
    const strong = analyzeSections(
      [
        { t: 0, p: 100 },
        { t: 3, p: 88 },
        { t: 10, p: 70 },
      ],
      autoSections(10),
    );
    expect(strong[0]?.verdict).toBe("STRONG");
    expect(acceleratorScore(strong, [{ t: 0, p: 100 }, { t: 3, p: 88 }, { t: 10, p: 70 }], 10)).toBeGreaterThan(50);
  });
});
