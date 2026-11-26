import { describe, expect, it } from "vitest";
import { estimateCurve } from "./estimate";
import {
  EXAMPLE_POINTS,
  acceleratorScore,
  analyzeSections,
  buildBreakdown,
  interpolate,
  maxDropInWindow,
} from "./retention";
import { splitSections } from "./signals";

describe("retention breakdown", () => {
  it("reads 62% at 3s on the example curve", () => {
    expect(Math.round(interpolate(EXAMPLE_POINTS, 3))).toBe(62);
  });

  it("flags a 2s cliff around the 80% mark on the example", () => {
    const drop = maxDropInWindow(EXAMPLE_POINTS, 31, 34, 2);
    expect(drop).toBeGreaterThanOrEqual(12);
  });

  it("labels a weak hook and a missed CTA on example data", () => {
    const sections = splitSections(42);
    const reports = analyzeSections(EXAMPLE_POINTS, sections);
    const hook = reports.find((s) => s.kind === "hook");
    const cta = reports.find((s) => s.kind === "cta");
    expect(hook?.verdict).toBe("WEAK");
    expect(hook?.combo).toContain("HOOK");
    expect(cta?.combo).toMatch(/CTA/);
    expect(hook?.reason.toLowerCase()).toMatch(/3s/);
  });

  it("scores the example in a coaching range, not a fake 100", () => {
    const breakdown = buildBreakdown(EXAMPLE_POINTS, splitSections(42), true, 42, "screenshot");
    expect(breakdown.score).toBeGreaterThan(20);
    expect(breakdown.score).toBeLessThan(80);
    expect(breakdown.topFixes.length).toBeGreaterThan(0);
    expect(breakdown.topFixes.length).toBeLessThanOrEqual(3);
    expect(breakdown.curveLabel).toBe("Curve: read from your screenshot");
  });

  it("uses a stronger 3s hold as a better hook", () => {
    const strong = analyzeSections(
      [
        { t: 0, p: 100 },
        { t: 3, p: 88 },
        { t: 10, p: 70 },
      ],
      splitSections(10),
    );
    expect(strong[0]?.verdict).toBe("STRONG");
    expect(acceleratorScore(strong, [{ t: 0, p: 100 }, { t: 3, p: 88 }, { t: 10, p: 70 }], 10)).toBeGreaterThan(50);
  });

  it("estimates a curve from avg watch + skip", () => {
    const points = estimateCurve(42, 14.2, 38);
    expect(Math.round(interpolate(points, 0))).toBe(100);
    expect(interpolate(points, 3)).toBeLessThan(75);
    expect(interpolate(points, 3)).toBeGreaterThan(40);
  });

  it("uses pauses as section boundaries when cuts are missing", () => {
    const sections = splitSections(42, {
      duration: 42,
      cuts: [],
      rms: [],
      silences: [
        { start: 1.4, end: 2.2 },
        { start: 30.5, end: 31.4 },
      ],
      firstWordAt: 0.5,
      hookCue: null,
      payoffCue: null,
      ctaCue: null,
    });
    expect(sections[0]?.end).toBe(1.4);
    expect(sections.find((s) => s.kind === "payoff")?.start).toBeGreaterThan(20);
  });

  it("splits sections from cut cues instead of only percents", () => {
    const sections = splitSections(42, {
      duration: 42,
      cuts: [1.4, 6, 14, 22, 31, 38],
      rms: [],
      silences: [],
      firstWordAt: 0.6,
      hookCue: { t: 0.5, text: "wait" },
      payoffCue: { t: 30, text: "here's the result" },
      ctaCue: { t: 37.5, text: "comment METHOD" },
    });
    expect(sections[0]?.end).toBeLessThanOrEqual(3.2);
    expect(sections.find((s) => s.kind === "cta")?.start).toBeGreaterThan(30);
    expect(sections.find((s) => s.kind === "payoff")?.start).toBeGreaterThan(20);
  });
});
