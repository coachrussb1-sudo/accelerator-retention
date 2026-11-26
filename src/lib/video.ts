import { cuesFromTranscript, peakCuts, silencesFromRms, type Energy, type VideoSignals } from "./signals";
import { transcribeAudio } from "./whisper";

export type VideoProgress = (label: string, ratio?: number) => void;

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    video.currentTime = Math.max(0, Math.min(video.duration || t, t));
    video.addEventListener("seeked", done, { once: true });
    window.setTimeout(done, 500);
  });
}

function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (n * 0.75);
}

async function frameDiffs(url: string, duration: number, onProgress?: VideoProgress): Promise<Energy[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Couldn't read that video."));
  });
  const w = 160;
  const h = 90;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const step = Math.max(0.22, duration / 72);
  const samples: Energy[] = [];
  let prev: Uint8ClampedArray | null = null;
  for (let t = 0; t < duration; t += step) {
    await seek(video, t);
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    if (prev) samples.push({ t, v: meanAbsDiff(prev, data) });
    prev = new Uint8ClampedArray(data);
    onProgress?.("Watching…", 0.1 + 0.5 * (t / duration));
  }
  video.src = "";
  return samples;
}

async function audioRms(url: string, duration: number): Promise<Energy[]> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    await ctx.close();
    const channel = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const hop = Math.floor(sr * 0.05);
    const out: Energy[] = [];
    for (let i = 0; i < channel.length; i += hop) {
      let sum = 0;
      const end = Math.min(channel.length, i + hop);
      for (let j = i; j < end; j++) sum += channel[j] * channel[j];
      const t = i / sr;
      if (t > duration) break;
      out.push({ t, v: Math.sqrt(sum / Math.max(1, end - i)) });
    }
    return out;
  } catch {
    return [];
  }
}

export async function analyzeVideo(url: string, onProgress?: VideoProgress): Promise<VideoSignals> {
  onProgress?.("Watching…", 0.05);
  const probe = document.createElement("video");
  probe.muted = true;
  probe.playsInline = true;
  probe.preload = "metadata";
  probe.src = url;
  const duration = await new Promise<number>((resolve, reject) => {
    probe.onloadedmetadata = () => resolve(probe.duration || 0);
    probe.onerror = () => reject(new Error("Couldn't read that video."));
  });
  probe.src = "";
  const diffs = await frameDiffs(url, duration, onProgress);
  onProgress?.("Watching…", 0.7);
  const rms = await audioRms(url, duration);
  const meanRms = rms.length ? rms.reduce((s, x) => s + x.v, 0) / rms.length : 0;
  let transcriptCues: ReturnType<typeof cuesFromTranscript> = {
    firstWordAt: null,
    hookCue: null,
    payoffCue: null,
    ctaCue: null,
  };
  if (meanRms > 0.012) {
    onProgress?.("Listening…", 0.8);
    const chunks = await transcribeAudio(url, (ratio) => onProgress?.("Listening…", 0.8 + 0.15 * ratio));
    if (chunks?.length) transcriptCues = cuesFromTranscript(chunks);
  }
  return {
    duration,
    cuts: peakCuts(diffs),
    rms,
    silences: silencesFromRms(rms, duration),
    ...transcriptCues,
  };
}

export async function thumbsFor(url: string, stamps: Array<{ id: string; t: number }>): Promise<Record<string, string>> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => resolve();
  });
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  const out: Record<string, string> = {};
  if (!ctx) return out;
  for (const stamp of stamps) {
    await seek(video, stamp.t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    out[stamp.id] = canvas.toDataURL("image/jpeg", 0.7);
  }
  video.src = "";
  return out;
}
