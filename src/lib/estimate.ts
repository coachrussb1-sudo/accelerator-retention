import { clamp, interpolate, round1, type Point } from "./retention";

export type Energy = { t: number; v: number };

/**
 * Approximate a retention curve when the per-second plot isn't in the CSV.
 * Shaped by skip + average watch time, then by video energy if present.
 */
export function estimateCurve(
  duration: number,
  avgWatch: number | null,
  skipRate: number | null,
  energy: Energy[] = [],
): Point[] {
  const d = Math.max(1, duration);
  const skip = clamp(skipRate ?? 28, 0, 85);
  const hook = clamp(100 - skip, 18, 96);
  const awt = clamp(avgWatch ?? d * 0.38, d * 0.08, d * 0.92);
  const k = solveDecay(d, hook, awt);

  const times: number[] = [0];
  if (d >= 1) times.push(1);
  if (d >= 3) times.push(3);
  for (let pct = 10; pct <= 100; pct += 10) times.push(round1((d * pct) / 100));
  const uniq = [...new Set(times.map(round1))].sort((a, b) => a - b);

  const base: Point[] = uniq.map((t) => {
    let p: number;
    if (t <= 0) p = 100;
    else if (t <= 3) p = 100 - ((100 - hook) * t) / Math.min(3, d);
    else p = hook * Math.exp(-k * (t - 3));
    return { t, p: clamp(p, 4, 100) };
  });

  if (energy.length < 4) return base;

  const mean = energy.reduce((s, e) => s + e.v, 0) / energy.length;
  return base.map((pt) => {
    if (pt.t <= 3) return pt;
    const e = nearest(energy, pt.t);
    const dead = e < mean * 0.55;
    const bump = dead ? 0.92 : 1.03;
    return { t: pt.t, p: clamp(pt.p * bump, 4, interpolate(base, pt.t) + 8) };
  });
}

function solveDecay(duration: number, hook: number, awt: number): number {
  const hookIntegral = (3 * (100 + hook)) / 2 / 100;
  let lo = 0.01;
  let hi = 1.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const tail = (hook / 100 / mid) * (1 - Math.exp(-mid * Math.max(0.2, duration - 3)));
    if (hookIntegral + tail > awt) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function nearest(energy: Energy[], t: number): number {
  let best = energy[0]?.v ?? 0;
  let dist = Infinity;
  for (const e of energy) {
    const d = Math.abs(e.t - t);
    if (d < dist) {
      dist = d;
      best = e.v;
    }
  }
  return best;
}
