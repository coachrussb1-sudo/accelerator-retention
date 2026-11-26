import type { CueHit } from "./signals";

type Progress = (ratio: number) => void;

/**
 * Optional on-device Whisper. Lazy-loaded from a CDN so the app still
 * works if the model, WASM, or network fails.
 */
export async function transcribeAudio(url: string, onProgress?: Progress): Promise<CueHit[] | null> {
  try {
    onProgress?.(0.05);
    const load = new Function("u", "return import(u)") as (u: string) => Promise<{
      pipeline: (task: string, model: string, opts?: object) => Promise<(input: unknown, opts?: object) => Promise<{ text?: string }>>;
    }>;
    const transformers = await load("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm");
    onProgress?.(0.2);
    const transcriber = await transformers.pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
      progress_callback: (ev: { progress?: number }) => {
        if (typeof ev.progress === "number") onProgress?.(0.2 + 0.6 * (ev.progress / 100));
      },
    });
    const result = await transcriber(url, { return_timestamps: true });
    onProgress?.(1);
    const text = typeof result?.text === "string" ? result.text : "";
    if (!text.trim()) return [];
    return [{ t: 0.4, text }];
  } catch {
    return null;
  }
}
