export type Point = { t: number; p: number };

export type SectionKind = "hook" | "setup" | "body" | "payoff" | "cta";

export type Verdict = "STRONG" | "OK" | "WEAK" | "CLIFF";

export type Section = {
  id: string;
  kind: SectionKind;
  name: string;
  start: number;
  end: number;
  note: string;
};

export type SectionReport = Section & {
  inPct: number;
  outPct: number;
  lost: number;
  max2sDrop: number;
  verdict: Verdict;
  combo: string;
  reason: string;
};

export type CurveSource =
  | "screenshot"
  | "csv"
  | "video"
  | "example";

export type Breakdown = {
  duration: number;
  example: boolean;
  curveSource: CurveSource;
  curveLabel: string;
  sections: SectionReport[];
  score: number;
  topFixes: string[];
};

export type ReasonHints = {
  cutInFirst15: boolean;
  firstWordAt: number | null;
  hookCue: boolean;
  ctaCue: boolean;
  payoffBefore75: boolean;
  skipRate: number | null;
};

export const EXAMPLE_DURATION = 42;

/** Labeled example data — not real viewer analytics. */
export const EXAMPLE_POINTS: Point[] = [
  { t: 0, p: 100 },
  { t: 1, p: 88 },
  { t: 3, p: 62 },
  { t: 4.2, p: 59 },
  { t: 8.4, p: 56 },
  { t: 12.6, p: 46 },
  { t: 16.8, p: 36 },
  { t: 21, p: 34 },
  { t: 25.2, p: 32 },
  { t: 29.4, p: 31 },
  { t: 31.5, p: 29 },
  { t: 33.6, p: 15 },
  { t: 37.8, p: 13 },
  { t: 42, p: 11 },
];

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function interpolate(points: Point[], t: number): number {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return 0;
  if (t <= sorted[0].t) return sorted[0].p;
  const last = sorted[sorted.length - 1];
  if (t >= last.t) return last.p;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      return a.p + ((b.p - a.p) * (t - a.t)) / span;
    }
  }
  return last.p;
}

export function maxDropInWindow(points: Point[], start: number, end: number, window = 2): number {
  let max = 0;
  const from = Math.max(0, start);
  const to = Math.max(from, end);
  for (let t = from; t <= to - 0.25; t += 0.25) {
    const a = interpolate(points, t);
    const b = interpolate(points, Math.min(to, t + window));
    max = Math.max(max, a - b);
  }
  return max;
}

function verdictFor(kind: SectionKind, inPct: number, outPct: number, lostShare: number, max2s: number): Verdict {
  if (kind !== "hook" && max2s >= 12) return "CLIFF";
  if (kind === "hook" && outPct < 60) return "WEAK";
  if (kind === "cta" && inPct < 25) return "WEAK";
  if (lostShare >= 0.28) return "WEAK";
  if (kind === "hook" && outPct >= 80) return "STRONG";
  if (lostShare <= 0.1 && outPct >= 40) return "STRONG";
  return "OK";
}

function comboFor(section: Section, verdict: Verdict, hookVerdict: Verdict, inPct: number): string {
  if (section.kind === "hook" && verdict === "WEAK") return "HOOK — WEAK";
  if (section.kind === "hook" && verdict === "STRONG") return "HOOK — STRONG";
  if (section.kind === "hook") return "HOOK — OK";
  if (section.kind === "cta" && (verdict === "WEAK" || inPct < 25)) return "CTA — MISSED";
  if (section.kind === "cta" && verdict === "CLIFF") return "CTA — CLIFF";
  if (section.kind === "payoff" && (verdict === "WEAK" || verdict === "CLIFF")) {
    return hookVerdict === "STRONG" || hookVerdict === "OK" ? "HOOK GOOD, PAYOFF WEAK" : "PAYOFF — WEAK";
  }
  if (section.kind === "body" && verdict === "CLIFF") return `${section.name} — CLIFF`;
  if (section.kind === "body" && verdict === "WEAK") return "PACING DROPPED";
  if (verdict === "STRONG") return `${section.name} — STRONG`;
  if (verdict === "CLIFF") return `${section.name} — CLIFF`;
  if (verdict === "WEAK") return `${section.name} — WEAK`;
  return `${section.name} — HOLDING`;
}

function reasonFor(
  section: Section,
  verdict: Verdict,
  lost: number,
  inPct: number,
  outPct: number,
  max2s: number,
  hints: ReasonHints | undefined,
): string {
  if (section.kind === "hook" && verdict === "WEAK") {
    if (hints && !hints.cutInFirst15) return `${Math.round(100 - outPct)}% gone by 3s. Cut in the first 1.5s.`;
    return `${Math.round(100 - outPct)}% gone by 3s. Open on the result.`;
  }
  if (section.kind === "hook" && verdict === "STRONG") {
    return `Held ${Math.round(outPct)}% through ${formatTime(section.end)}.`;
  }
  if (section.kind === "hook") {
    if (hints?.firstWordAt != null && hints.firstWordAt > 2.5) return `First word at ${formatTime(hints.firstWordAt)}. Talk sooner.`;
    return `Tighten the first 3s.`;
  }
  if (section.kind === "cta" && (verdict === "WEAK" || inPct < 25)) {
    return `Only ${Math.round(inPct)}% saw it. Move it before 75%.`;
  }
  if (verdict === "CLIFF") {
    return `${Math.round(max2s)}% dropped in ~2s. Cut dead air.`;
  }
  if (section.kind === "payoff" && (verdict === "WEAK" || verdict === "CLIFF")) {
    if (hints && !hints.payoffBefore75) return `Payoff lands late. Deliver it before 75%.`;
    return `Lost them before the reveal. Hit the payoff sooner.`;
  }
  if (section.kind === "body" && verdict === "WEAK") {
    return `Steady bleed ${formatTime(section.start)}–${formatTime(section.end)}. Cut or interrupt.`;
  }
  if (section.kind === "setup" && (verdict === "WEAK" || verdict === "CLIFF")) {
    return `People leave before the promise. One-beat setup.`;
  }
  if (verdict === "STRONG") return `Held ${Math.round(outPct)}%. Don’t stretch it.`;
  return `${Math.round(lost)} pts lost. Keep it moving.`;
}

export function formatTime(t: number): string {
  if (t < 10) return `${t.toFixed(1).replace(/\.0$/, "")}s`;
  return `${Math.round(t)}s`;
}

export function analyzeSections(points: Point[], sections: Section[], hints?: ReasonHints): SectionReport[] {
  let hookVerdict: Verdict = "OK";
  const reports: SectionReport[] = [];
  for (const section of sections) {
    const inPct = interpolate(points, section.start);
    const outPct = interpolate(points, section.end);
    const lost = Math.max(0, inPct - outPct);
    const lostShare = inPct > 1 ? lost / inPct : 0;
    const max2s = maxDropInWindow(points, section.start, section.end, 2);
    const verdict = verdictFor(section.kind, inPct, outPct, lostShare, max2s);
    if (section.kind === "hook") hookVerdict = verdict;
    reports.push({
      ...section,
      inPct,
      outPct,
      lost,
      max2sDrop: max2s,
      verdict,
      combo: comboFor(section, verdict, hookVerdict, inPct),
      reason: reasonFor(section, verdict, lost, inPct, outPct, max2s, hints),
    });
  }
  return reports;
}

export function acceleratorScore(reports: SectionReport[], points: Point[], duration: number): number {
  const hook = reports.find((s) => s.kind === "hook");
  const cta = reports.find((s) => s.kind === "cta");
  const end = interpolate(points, duration);
  const hookHold = hook?.outPct ?? interpolate(points, Math.min(3, duration));
  const hookPts = clamp(hookHold / 80, 0, 1) * 32;
  const cliffs = reports.filter((s) => s.verdict === "CLIFF").length;
  const cliffPts = Math.max(0, 18 - cliffs * 9);
  const avgLost =
    reports.reduce((sum, s) => sum + (s.inPct > 1 ? s.lost / s.inPct : 0), 0) / Math.max(1, reports.length);
  const pacePts = clamp(1 - avgLost / 0.35, 0, 1) * 20;
  const ctaPts = clamp((cta?.inPct ?? 0) / 40, 0, 1) * 18;
  const endPts = clamp(end / 25, 0, 1) * 12;
  return Math.round(clamp(hookPts + cliffPts + pacePts + ctaPts + endPts, 0, 100));
}

export function topFixes(reports: SectionReport[]): string[] {
  const rank: Record<Verdict, number> = { CLIFF: 4, WEAK: 3, OK: 1, STRONG: 0 };
  return [...reports]
    .sort((a, b) => rank[b.verdict] - rank[a.verdict] || b.lost - a.lost)
    .filter((s) => s.verdict === "CLIFF" || s.verdict === "WEAK" || s.lost >= 8)
    .slice(0, 3)
    .map((s) => `${s.combo}: ${s.reason}`);
}

export function curveLabel(source: CurveSource, _example = false): string {
  if (source === "screenshot") return "Curve: read from your screenshot";
  if (source === "csv") return "Curve: estimated from avg watch time, upload your retention screenshot for exact";
  if (source === "video") return "Curve: estimated from video pacing, upload a retention screenshot for exact";
  return "Curve: example data";
}

export function buildBreakdown(
  points: Point[],
  sections: Section[],
  example: boolean,
  duration: number,
  source: CurveSource = "example",
  hints?: ReasonHints,
): Breakdown {
  const reports = analyzeSections(points, sections, hints);
  return {
    duration,
    example,
    curveSource: source,
    curveLabel: curveLabel(source, example),
    sections: reports,
    score: acceleratorScore(reports, points, duration),
    topFixes: topFixes(reports),
  };
}

export const SECTION_COLORS: Record<SectionKind, string> = {
  hook: "#78fa3d",
  setup: "#9ae66e",
  body: "#e8c547",
  payoff: "#e07a3d",
  cta: "#f5f5f1",
};
