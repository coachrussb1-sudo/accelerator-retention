import type { Point } from "./retention";
import { clamp } from "./retention";

export type Pix = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

export type TraceResult = {
  points: Point[];
  confidence: number;
};

function lum(data: Uint8Array, i: number): number {
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

function sat(data: Uint8Array, i: number): number {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function idx(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

/** Auto-trace a retention screenshot into % vs time. Assumes y-scale 0–100. */
export function traceRetention(image: Pix): TraceResult | null {
  const { width, height, data } = image;
  if (width < 40 || height < 40) return null;
  const buf = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);

  const bg = sampleBg(buf, width, height);
  const box = findPlotBox(buf, width, height, bg);
  const left = box.left;
  const right = box.right;
  const top = box.top;
  const bottom = box.bottom;
  const step = Math.max(1, Math.floor((right - left) / 120));
  const ys: Array<{ x: number; y: number } | null> = [];

  const grid = new Set<number>();
  for (let y = top; y <= bottom; y++) {
    let faint = 0;
    const span = Math.max(1, right - left);
    for (let x = left; x < right; x += 2) {
      const i = idx(width, x, y);
      const S = sat(buf, i);
      const C = Math.abs(lum(buf, i) - bg);
      if (S < 0.12 && C > 6 && C < 42) faint += 1;
    }
    if (faint > span * 0.16) grid.add(y);
  }

  for (let x = left; x < right; x += step) {
    ys.push(pickY(buf, width, x, top, bottom, bg, grid));
  }

  const hits = ys.filter((v): v is { x: number; y: number } => v != null);
  if (hits.length < 8) return null;

  const span = right - left || 1;
  const plotH = bottom - top || 1;
  const points: Point[] = hits.map((hit) => {
    const t = (hit.x - left) / span;
    const p = clamp(((bottom - hit.y) / plotH) * 100, 0, 100);
    return { t, p };
  });

  const smoothed = smooth(points, 2);
  if (smoothed[0] && smoothed[0].t > 0.02) {
    smoothed.unshift({ t: 0, p: Math.max(smoothed[0].p, 90) });
  }

  const confidence = hits.length / ys.length;
  return { points: resampleTime(smoothed), confidence };
}

function findPlotBox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: number,
): { left: number; right: number; top: number; bottom: number } {
  const lineXs: number[] = [];
  const gridYs: number[] = [];
  const x0 = Math.round(width * 0.04);
  const x1 = Math.round(width * 0.98);
  const y0 = Math.round(height * 0.06);
  const y1 = Math.round(height * 0.96);

  for (let y = y0; y < y1; y++) {
    let faint = 0;
    for (let x = x0; x < x1; x += 2) {
      const L = lum(data, idx(width, x, y));
      const S = sat(data, idx(width, x, y));
      if (S < 0.12 && Math.abs(L - bg) > 8 && Math.abs(L - bg) < 40) faint += 1;
    }
    if (faint > (x1 - x0) * 0.18) gridYs.push(y);
  }

  for (let x = x0; x < x1; x += 2) {
    for (let y = y0; y < y1; y += 2) {
      const i = idx(width, x, y);
      if (sat(data, i) > 0.2 && Math.abs(lum(data, i) - bg) > 12) lineXs.push(x);
    }
  }

  const left = lineXs.length ? Math.min(...lineXs) : Math.round(width * 0.11);
  const right = lineXs.length ? Math.max(...lineXs) : Math.round(width * 0.95);
  const maxLineY = lineXs.length ? Math.max(...lineYsSafe(data, width, height, bg, left, right)) : Math.round(height * 0.88);
  let top: number;
  let bottom: number;
  const grids = uniqueYs(gridYs);
  if (grids.length >= 2) {
    top = grids[0];
    const gaps = grids.slice(1).map((y, i) => y - grids[i]);
    const gap = median(gaps);
    bottom = grids[grids.length - 1];
    if (gap > 8 && maxLineY > bottom + gap * 0.35) {
      bottom = Math.min(height - 2, bottom + gap);
    }
  } else {
    top = Math.round(height * 0.15);
    bottom = Math.round(height * 0.88);
  }
  return {
    left,
    right: Math.max(left + 8, right),
    top,
    bottom: Math.max(top + 8, bottom),
  };
}

function uniqueYs(ys: number[]): number[] {
  const sorted = [...ys].sort((a, b) => a - b);
  const out: number[] = [];
  for (const y of sorted) {
    if (!out.length || y - out[out.length - 1] > 3) out.push(y);
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function lineYsSafe(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: number,
  left: number,
  right: number,
): number[] {
  const ys: number[] = [];
  for (let x = left; x < right; x += 3) {
    for (let y = 0; y < height; y += 2) {
      const i = idx(width, x, y);
      if (sat(data, i) > 0.2 && Math.abs(lum(data, i) - bg) > 12) ys.push(y);
    }
  }
  return ys.length ? ys : [Math.round(height * 0.88)];
}

function sampleBg(data: Uint8ClampedArray, width: number, height: number): number {
  const spots = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [Math.floor(width / 2), 2],
  ];
  let sum = 0;
  for (const [x, y] of spots) sum += lum(data, idx(width, x, y));
  return sum / spots.length;
}

function isSeries(data: Uint8ClampedArray, i: number, bg: number): boolean {
  const S = sat(data, i);
  const C = Math.abs(lum(data, i) - bg);
  return S > 0.16 && C > 12;
}

function pickY(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  top: number,
  bottom: number,
  bg: number,
  grid: Set<number>,
): { x: number; y: number } | null {
  for (let y = top; y < bottom; y++) {
    if (grid.has(y)) continue;
    const i = idx(width, x, y);
    if (isSeries(data, i, bg)) return { x, y };
  }
  return null;
}

function smooth(points: Point[], radius: number): Point[] {
  return points.map((pt, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      const other = points[j];
      if (!other) continue;
      sum += other.p;
      n += 1;
    }
    return { t: pt.t, p: sum / Math.max(1, n) };
  });
}

function resampleTime(points: Point[]): Point[] {
  return points.map((pt) => ({ t: clamp(pt.t, 0, 1), p: clamp(pt.p, 0, 100) }));
}

export function pointsToDuration(points: Point[], duration: number): Point[] {
  return points.map((pt) => ({
    t: pt.t <= 1.0001 ? pt.t * duration : pt.t,
    p: pt.p,
  }));
}

export async function imageDataFromBlob(blob: Blob): Promise<Pix> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read that screenshot.");
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { width: img.width, height: img.height, data: img.data };
}

export function paintCurve(width: number, height: number, points: Point[], duration: number): Pix {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 18;
    data[i + 1] = 18;
    data[i + 2] = 18;
    data[i + 3] = 255;
  }
  const left = Math.round(width * 0.11);
  const right = Math.round(width * 0.95);
  const top = Math.round(height * 0.15);
  const bottom = Math.round(height * 0.88);
  for (const pct of [0, 50, 100]) {
    const y = Math.round(bottom - (pct / 100) * (bottom - top));
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      data[i] = 48;
      data[i + 1] = 48;
      data[i + 2] = 48;
      data[i + 3] = 255;
    }
  }
  const xy = (t: number, p: number) => ({
    x: left + (t / duration) * (right - left),
    y: bottom - (p / 100) * (bottom - top),
  });
  const sorted = [...points].sort((a, b) => a.t - b.t);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = xy(sorted[i].t, sorted[i].p);
    const b = xy(sorted[i + 1].t, sorted[i + 1].p);
    stroke(data, width, a.x, a.y, b.x, b.y);
  }
  return { width, height, data };
}

function stroke(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number) {
  const steps = Math.max(2, Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= width) continue;
        const i = (py * width + px) * 4;
        if (i < 0 || i + 3 >= data.length) continue;
        data[i] = 91;
        data[i + 1] = 159;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
  }
}
