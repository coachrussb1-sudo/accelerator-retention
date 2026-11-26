import { round1, type Section, type SectionKind } from "./retention";

export type Energy = { t: number; v: number };

export type CueHit = { t: number; text: string };

export type VideoSignals = {
  duration: number;
  cuts: number[];
  rms: Energy[];
  silences: Array<{ start: number; end: number }>;
  firstWordAt: number | null;
  hookCue: CueHit | null;
  payoffCue: CueHit | null;
  ctaCue: CueHit | null;
};

const HOOK_WORDS = /\b(wait|stop|watch|don't|dont|if you|secret|nobody|stop scrolling)\b/i;
const PAYOFF_WORDS = /\b(here's|heres|that's why|thats why|the point|result|before|after|reveal|punchline)\b/i;
const CTA_WORDS = /\b(link in bio|comment|dm me|dm|d\.m|follow|save this|book|method|tap the)\b/i;

export function cuesFromTranscript(chunks: CueHit[]): Pick<VideoSignals, "hookCue" | "payoffCue" | "ctaCue" | "firstWordAt"> {
  const first = chunks.find((c) => c.text.trim().length > 0) ?? null;
  return {
    firstWordAt: first?.t ?? null,
    hookCue: chunks.find((c) => HOOK_WORDS.test(c.text) && c.t <= 8) ?? null,
    payoffCue: [...chunks].reverse().find((c) => PAYOFF_WORDS.test(c.text)) ?? null,
    ctaCue: [...chunks].reverse().find((c) => CTA_WORDS.test(c.text)) ?? null,
  };
}

export function silencesFromRms(rms: Energy[], duration: number, floor = 0.02): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  for (const sample of rms) {
    const quiet = sample.v < floor;
    if (quiet && start == null) start = sample.t;
    if (!quiet && start != null) {
      if (sample.t - start >= 0.6) out.push({ start, end: sample.t });
      start = null;
    }
  }
  if (start != null && duration - start >= 0.6) out.push({ start, end: duration });
  return out;
}

export function peakCuts(samples: Energy[], minGap = 1.2, z = 1.6): number[] {
  if (samples.length < 6) return [];
  const mean = samples.reduce((s, x) => s + x.v, 0) / samples.length;
  const variance = samples.reduce((s, x) => s + (x.v - mean) ** 2, 0) / samples.length;
  const std = Math.sqrt(variance);
  const thresh = Math.max(mean + z * std, mean * 2.2);
  const peaks: number[] = [];
  for (const sample of samples) {
    if (sample.v < thresh) continue;
    const last = peaks[peaks.length - 1];
    if (last != null && sample.t - last < minGap) {
      if (sample.v > (samples.find((s) => s.t === last)?.v ?? 0)) peaks[peaks.length - 1] = sample.t;
      continue;
    }
    peaks.push(sample.t);
  }
  return peaks;
}

export function splitSections(duration: number, signals?: VideoSignals | null): Section[] {
  const d = Math.max(3, duration);
  const pauseStarts = (signals?.silences ?? [])
    .filter((s) => s.end - s.start >= 0.6)
    .map((s) => s.start);
  const cuts = [...(signals?.cuts ?? []), ...pauseStarts]
    .filter((t) => t > 0.35 && t < d - 0.35)
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - all[i - 1] >= 0.45);
  const hookCut = cuts.find((t) => t >= 0.8 && t <= 3.2);
  const hookEnd = round1(hookCut ?? Math.min(3, d * 0.12));

  const ctaCue = signals?.ctaCue?.t;
  const lateCut = [...cuts].find((t) => t >= d * 0.82);
  const ctaStart = round1(
    clampNum(ctaCue ?? lateCut ?? d * 0.9, Math.max(hookEnd + 2, d * 0.72), d - 0.4),
  );

  const payoffCue = signals?.payoffCue?.t;
  const payoffCut = [...cuts].reverse().find((t) => t >= d * 0.55 && t < ctaStart - 0.5);
  const payoffStart = round1(
    clampNum(payoffCue ?? payoffCut ?? d * 0.7, Math.max(hookEnd + 1.5, d * 0.45), ctaStart - 0.4),
  );

  const setupCut = cuts.find((t) => t > hookEnd + 0.7 && t < Math.min(d * 0.3, payoffStart - 1));
  const setupEnd = round1(clampNum(setupCut ?? d * 0.2, hookEnd + 0.5, payoffStart - 0.8));

  const bodyCuts = cuts.filter((t) => t > setupEnd + 0.8 && t < payoffStart - 0.8);
  const beats = bodyBeats(setupEnd, payoffStart, bodyCuts, d);

  return [
    section("hook", "HOOK", "hook", 0, hookEnd),
    section("setup", "SETUP", "setup", hookEnd, setupEnd),
    ...beats,
    section("payoff", "PAYOFF", "payoff", payoffStart, ctaStart),
    section("cta", "CTA", "cta", ctaStart, round1(d)),
  ];
}

function bodyBeats(start: number, end: number, cuts: number[], duration: number): Section[] {
  const span = end - start;
  if (span < 1.2) return [section("body-1", "BODY", "body", start, end)];
  const want = duration >= 28 ? 3 : 2;
  const inner = cuts.slice(0, want - 1);
  const bounds = [start, ...inner, end];
  if (bounds.length < 3) {
    const n = want;
    const even: number[] = [];
    for (let i = 0; i <= n; i++) even.push(round1(start + (span * i) / n));
    return even.slice(0, -1).map((s, i) =>
      section(`body-${i + 1}`, n === 1 ? "BODY" : `BODY ${i + 1}`, "body", s, even[i + 1]),
    );
  }
  const unique = bounds.filter((t, i) => i === 0 || t - bounds[i - 1] >= 0.6);
  if (unique[unique.length - 1] !== end) unique[unique.length - 1] = end;
  return unique.slice(0, -1).map((s, i) =>
    section(`body-${i + 1}`, unique.length <= 2 ? "BODY" : `BODY ${i + 1}`, "body", s, unique[i + 1]),
  );
}

function section(id: string, name: string, kind: SectionKind, start: number, end: number): Section {
  return { id, kind, name, start: round1(start), end: round1(end), note: "" };
}

function clampNum(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
