import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { EXAMPLE_DURATION, EXAMPLE_POINTS, interpolate } from "./retention";
import { paintCurve, pointsToDuration, traceRetention } from "./trace";

describe("retention screenshot trace", () => {
  it("recovers a painted example curve", () => {
    const pix = paintCurve(780, 390, EXAMPLE_POINTS, EXAMPLE_DURATION);
    const traced = traceRetention(pix);
    expect(traced).not.toBeNull();
    const points = pointsToDuration(traced!.points, EXAMPLE_DURATION);
    const at3 = interpolate(points, 3);
    expect(at3).toBeGreaterThan(50);
    expect(at3).toBeLessThan(75);
    const atEnd = interpolate(points, 41);
    expect(atEnd).toBeLessThan(25);
  });

  it("traces the bundled example screenshot", () => {
    const png = PNG.sync.read(readFileSync(new URL("../../public/assets/example-retention.png", import.meta.url)));
    const traced = traceRetention({ width: png.width, height: png.height, data: png.data });
    expect(traced).not.toBeNull();
    const points = pointsToDuration(traced!.points, EXAMPLE_DURATION);
    const at3 = interpolate(points, 3);
    const atPayoff = interpolate(points, 29.4);
    const atCliff = interpolate(points, 33.6);
    const atEnd = interpolate(points, 41);
    expect(at3).toBeGreaterThan(50);
    expect(at3).toBeLessThan(75);
    expect(atEnd).toBeLessThan(22);
    expect(atEnd).toBeGreaterThan(2);
    expect(atPayoff).toBeGreaterThan(20);
    expect(atCliff).toBeLessThan(atPayoff - 5);
  });
});
