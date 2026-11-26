import { useRef, useState, type DragEvent } from "react";
import { IG_URL, MENTORSHIP_URL } from "../lib/kit";
import {
  EXAMPLE_CSV,
  EXAMPLE_SHOT,
  HOWTO_VIDEO,
  runPipeline,
  type PipelineResult,
} from "../lib/pipeline";
import { SECTION_COLORS, formatTime, type Verdict } from "../lib/retention";

const VERDICT_STYLE: Record<Verdict, string> = {
  STRONG: "bg-lime text-black",
  OK: "bg-cream/15 text-cream",
  WEAK: "bg-gold text-black",
  CLIFF: "bg-rust text-cream",
};

const ACCEPT = "video/*,image/*,.csv,.mp4,.mov,.webm,.png,.jpg,.jpeg,.webp";

export function Accelerator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);

  async function run(files: File[], example = false) {
    if (!files.length && !example) return;
    setError(null);
    setProgress("Reading…");
    try {
      const next = await runPipeline(files, {
        example,
        onProgress: (label) => setProgress(label || "Reading…"),
      });
      if (next.error) {
        setError(next.error);
        setResult(null);
      } else {
        setResult(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read those files.");
      setResult(null);
    } finally {
      setProgress("");
    }
  }

  async function onExample() {
    setProgress("Reading…");
    try {
      const [video, shot] = await Promise.all([
        fetch(HOWTO_VIDEO).then((r) => r.blob()),
        fetch(EXAMPLE_SHOT).then((r) => r.blob()),
      ]);
      await run(
        [
          new File([video], "export-howto.mp4", { type: "video/mp4" }),
          new File([shot], "example-retention.png", { type: "image/png" }),
          new File([EXAMPLE_CSV], "sample-meta-business-suite-content.csv", { type: "text/csv" }),
        ],
        true,
      );
    } catch {
      setError("Couldn't load the example.");
      setProgress("");
    }
  }

  function take(list: FileList | null) {
    if (!list?.length) return;
    void run([...list]);
  }

  return (
    <div className="min-h-svh bg-black px-4 pb-16 pt-4">
      <div className="mx-auto w-full max-w-[430px]">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-[26px] leading-none tracking-wide text-lime">ACCELERATOR</p>
            <p className="mt-1 text-[10px] tracking-[0.16em] text-muted uppercase">by Coach Russ / TRIUMFIT</p>
          </div>
          <a
            href={MENTORSHIP_URL}
            className="inline-flex h-9 shrink-0 items-center rounded-full bg-cream px-3 text-[10px] font-bold tracking-[0.08em] text-black uppercase"
          >
            Book mentorship
          </a>
        </header>

        <p className="mt-8 text-center font-mono text-[11px] tracking-[0.22em] text-muted">[ Retention Breakdown ]</p>

        {result && !progress ? (
          <Results result={result} onReset={() => setResult(null)} />
        ) : (
          <section className="mt-6 rounded-[28px] border border-white/8 bg-[#0c0c0c] p-4 sm:p-5">
            <button
              type="button"
              data-testid="dropzone"
              disabled={Boolean(progress)}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(event: DragEvent) => {
                event.preventDefault();
                setOver(false);
                take(event.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex min-h-[168px] w-full flex-col items-center justify-center rounded-[28px] border border-dashed px-5 py-8 text-center ${
                over ? "border-lime bg-lime/8" : "border-white/18 bg-[#0a0a12]"
              }`}
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-cream">↑</span>
              <p className="text-[15px] font-semibold text-cream">{progress || "Drop the reel, screenshot, or CSV"}</p>
              {!progress ? <p className="mt-1 text-[13px] text-muted">or click to choose</p> : null}
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(event) => {
                take(event.target.files);
                event.target.value = "";
              }}
            />
            {error ? (
              <p className="mt-3 text-center text-[13px] text-rust" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              data-testid="try-example"
              onClick={() => void onExample()}
              disabled={Boolean(progress)}
              className="mt-3 w-full text-center text-[11px] text-muted/70 underline-offset-2 hover:text-cream hover:underline"
            >
              Try the example
            </button>
          </section>
        )}

        <footer className="mt-8 text-center">
          <a href={IG_URL} className="font-mono text-[10px] tracking-[0.16em] text-muted hover:text-cream">
            @russ_b1
          </a>
        </footer>
      </div>
    </div>
  );
}

function Results({ result, onReset }: { result: PipelineResult; onReset: () => void }) {
  const { breakdown, thumbs } = result;
  return (
    <div className="mt-6 space-y-4">
      {breakdown.example ? (
        <p className="rounded-full bg-lime/15 px-3 py-1.5 text-center text-[11px] font-semibold tracking-[0.16em] text-lime uppercase">
          Example data
        </p>
      ) : null}

      <section className="rounded-[28px] border border-white/8 bg-[#0c0c0c] p-5">
        <CurveChart duration={breakdown.duration} reports={breakdown} />
        <p className="mt-3 text-center text-[12px] text-muted">{breakdown.curveLabel}</p>
      </section>

      <div className="space-y-3">
        {breakdown.sections.map((section) => (
          <article key={section.id} className="rounded-[28px] border border-white/8 bg-[#0c0c0c] p-4">
            {thumbs[section.id] ? (
              <img src={thumbs[section.id]} alt="" className="mb-3 h-28 w-full rounded-2xl object-cover" />
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-[28px] leading-none tracking-wide text-cream">{section.name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] ${VERDICT_STYLE[section.verdict]}`}>
                {section.verdict}
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted">
              {formatTime(section.start)}–{formatTime(section.end)} · {Math.round(section.inPct)}% → {Math.round(section.outPct)}%
            </p>
            <p className="mt-2 text-[13px] font-semibold tracking-[0.06em] text-lime">{section.combo}</p>
            <p className="mt-1 text-[14px] leading-snug text-cream">{section.reason}</p>
          </article>
        ))}
      </div>

      <section className="rounded-[28px] border border-white/8 bg-[#0c0c0c] p-5">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted">[ Accelerator score ]</p>
        <p className="mt-1 font-display text-[72px] leading-none text-lime">{breakdown.score}</p>
        <p className="text-sm text-muted">/100 · rule of thumb</p>
        <ol className="mt-5 space-y-3">
          {breakdown.topFixes.map((fix, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-snug">
              <span className="font-display text-lime">{i + 1}</span>
              <span>{fix}</span>
            </li>
          ))}
        </ol>
        <a
          href={MENTORSHIP_URL}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-lime text-[11px] font-bold tracking-[0.1em] text-black uppercase"
        >
          Book a mentorship consult
        </a>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 w-full text-center text-[11px] tracking-[0.14em] text-muted uppercase"
        >
          Drop another
        </button>
      </section>
    </div>
  );
}

function CurveChart({
  duration,
  reports,
}: {
  duration: number;
  reports: PipelineResult["breakdown"];
}) {
  const w = 320;
  const h = 140;
  const pad = 12;
  const curve = sampleCurve(reports, duration);
  const d = curve
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pad + (pt.t / duration) * (w - 2 * pad)} ${pad + ((100 - pt.p) / 100) * (h - 2 * pad)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-hidden rounded-2xl bg-black">
      {reports.sections.map((section) => {
        const x = pad + (section.start / duration) * (w - 2 * pad);
        const width = ((section.end - section.start) / duration) * (w - 2 * pad);
        return (
          <rect
            key={section.id}
            x={x}
            y={0}
            width={Math.max(1, width)}
            height={h}
            fill={SECTION_COLORS[section.kind]}
            opacity={0.16}
          />
        );
      })}
      <path d={d} fill="none" stroke="#f5f5f1" strokeWidth="2.4" />
    </svg>
  );
}

function sampleCurve(breakdown: PipelineResult["breakdown"], duration: number) {
  const pts: Array<{ t: number; p: number }> = [];
  for (const section of breakdown.sections) {
    pts.push({ t: section.start, p: section.inPct });
    pts.push({ t: section.end, p: section.outPct });
  }
  if (!pts.length) return [{ t: 0, p: 100 }, { t: duration, p: 20 }];
  return pts;
}
