import { parseInsightsCsv, pickRow, type InsightsRow, type ParsedCsv } from "./csv";
import { estimateCurve } from "./estimate";
import {
  EXAMPLE_DURATION,
  EXAMPLE_POINTS,
  buildBreakdown,
  interpolate,
  type Breakdown,
  type CurveSource,
  type Point,
  type ReasonHints,
} from "./retention";
import { splitSections, type VideoSignals } from "./signals";
import { imageDataFromBlob, pointsToDuration, traceRetention } from "./trace";
import { analyzeVideo, thumbsFor } from "./video";

export type PipelineResult = {
  breakdown: Breakdown;
  thumbs: Record<string, string>;
  videoUrl: string | null;
  csv: ParsedCsv | null;
  error: string | null;
};

export type ProgressFn = (label: string) => void;

function kindOf(file: File): "video" | "image" | "csv" | "other" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/.test(name)) return "video";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(name)) return "image";
  if (type.includes("csv") || name.endsWith(".csv") || name.endsWith(".txt")) return "csv";
  return "other";
}

export async function runPipeline(files: File[], opts: { example?: boolean; onProgress?: ProgressFn } = {}): Promise<PipelineResult> {
  const onProgress = opts.onProgress ?? (() => undefined);
  const example = Boolean(opts.example);
  onProgress("Reading…");

  const videos = files.filter((f) => kindOf(f) === "video");
  const images = files.filter((f) => kindOf(f) === "image");
  const csvs = files.filter((f) => kindOf(f) === "csv");

  let csv: ParsedCsv | null = null;
  for (const file of csvs) {
    csv = parseInsightsCsv(await file.text(), file.name);
  }

  let videoUrl: string | null = null;
  let signals: VideoSignals | null = null;
  if (videos[0]) {
    videoUrl = URL.createObjectURL(videos[0]);
    try {
      signals = await analyzeVideo(videoUrl, (label) => onProgress(label));
    } catch {
      signals = null;
    }
  }

  const duration =
    signals?.duration && Number.isFinite(signals.duration)
      ? signals.duration
      : csv?.picked?.duration ?? (example ? EXAMPLE_DURATION : 0);

  if (csv) {
    csv = { ...csv, picked: pickRow(csv.rows, duration || null) };
  }

  let source: CurveSource = "video";
  let points: Point[] | null = null;

  if (images[0]) {
    onProgress("Tracing…");
    try {
      const pix = await imageDataFromBlob(images[0]);
      const traced = traceRetention(pix);
      if (traced && traced.points.length >= 8) {
        const d = duration || EXAMPLE_DURATION;
        points = pointsToDuration(traced.points, d);
        source = "screenshot";
      }
    } catch {
      points = null;
    }
  }

  const row: InsightsRow | null = csv?.picked ?? null;
  if (!points) {
    const d = duration || row?.duration || 0;
    if (d > 0 && (row?.avgWatch != null || row?.skipRate != null)) {
      points = estimateCurve(d, row.avgWatch, row.skipRate, signals?.rms ?? []);
      source = "csv";
    } else if (d > 0 && signals) {
      points = estimateCurve(d, null, null, signals.rms);
      source = "video";
    }
  }

  if (!points || !duration) {
    if (example) {
      points = EXAMPLE_POINTS;
      source = "screenshot";
    } else {
      return {
        breakdown: buildBreakdown(EXAMPLE_POINTS, splitSections(EXAMPLE_DURATION), false, EXAMPLE_DURATION, "video"),
        thumbs: {},
        videoUrl,
        csv,
        error: "Need a reel, a retention screenshot, or a CSV.",
      };
    }
  }

  const d = duration || EXAMPLE_DURATION;
  const sections = splitSections(d, signals);
  const hints: ReasonHints = {
    cutInFirst15: (signals?.cuts ?? []).some((t) => t > 0.3 && t <= 1.5),
    firstWordAt: signals?.firstWordAt ?? null,
    hookCue: Boolean(signals?.hookCue),
    ctaCue: Boolean(signals?.ctaCue),
    payoffBefore75: (sections.find((s) => s.kind === "payoff")?.start ?? d) / d <= 0.75,
    skipRate: row?.skipRate ?? 100 - interpolate(points, Math.min(3, d)),
  };

  const breakdown = buildBreakdown(points, sections, example, d, example && source === "screenshot" ? "screenshot" : source, hints);

  let thumbs: Record<string, string> = {};
  if (videoUrl) {
    try {
      thumbs = await thumbsFor(
        videoUrl,
        sections.map((s) => ({ id: s.id, t: Math.min(d - 0.05, s.start + 0.12) })),
      );
    } catch {
      thumbs = {};
    }
  }

  onProgress("");
  return { breakdown, thumbs, videoUrl, csv, error: null };
}

export const EXAMPLE_CSV = `Caption,Post time,Content Type,Reach,Likes and reactions,Sticker taps,Replies,Link clicks,Comments,Shares,Results,Cost per result,Duration,Average watch time,Skip rate,Description
"Comment METHOD if the DMs are a mess",2026-01-06 09:12:00,Reel,8200,410,0,0,36,48,22,0,,28,9.4,22,"hook then offer"
"101k views. One sale. Here's the leak.",2026-01-09 18:40:00,Reel,18400,960,0,0,21,31,54,0,,42,14.2,38,"how-to export"
"Gym floor follow-up is not a system",2026-01-13 12:05:00,Photo,3900,180,0,0,8,12,6,0,,0,,,
`;

export const HOWTO_VIDEO = "./assets/export-howto.mp4";
export const HOWTO_POSTER = "./assets/export-howto-poster.jpg";
export const EXAMPLE_SHOT = "./assets/example-retention.png";
