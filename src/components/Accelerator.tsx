import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HOWTO_POSTER, HOWTO_VIDEO, IG_URL, MENTORSHIP_URL, SITE_URL, emailBreakdown } from "../lib/kit";
import {
  EXAMPLE_DURATION,
  EXAMPLE_POINTS,
  SECTION_COLORS,
  autoSections,
  buildBreakdown,
  defaultPoints,
  formatTime,
  type Point,
  type Section,
  type Verdict,
} from "../lib/retention";

type Screen = "input" | "result";

const VERDICT_STYLE: Record<Verdict, string> = {
  STRONG: "bg-lime text-ink",
  OK: "bg-cream/15 text-cream",
  WEAK: "bg-gold text-ink",
  CLIFF: "bg-rust text-cream",
};

export function Accelerator() {
  const [screen, setScreen] = useState<Screen>("input");
  const [duration, setDuration] = useState(EXAMPLE_DURATION);
  const [points, setPoints] = useState<Point[]>(EXAMPLE_POINTS);
  const [skipRate, setSkipRate] = useState("");
  const [avgWatch, setAvgWatch] = useState("");
  const [example, setExample] = useState(true);
  const [sections, setSections] = useState<Section[]>(() => autoSections(EXAMPLE_DURATION));
  const [videoUrl, setVideoUrl] = useState(HOWTO_VIDEO);
  const [videoLabel, setVideoLabel] = useState("Example how-to");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const localUrl = useRef<string | null>(null);

  const breakdown = useMemo(
    () => buildBreakdown(points, sections, example, duration),
    [points, sections, example, duration],
  );

  useEffect(() => {
    return () => {
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    let cancelled = false;
    const capture = async () => {
      try {
        await video.play().catch(() => undefined);
        video.pause();
        const next: Record<string, string> = {};
        for (const section of sections) {
          const t = Math.min(duration - 0.05, section.start + 0.15);
          await seek(video, t);
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          next[section.id] = canvas.toDataURL("image/jpeg", 0.7);
        }
        if (!cancelled) setThumbs(next);
      } catch {
        if (!cancelled) setThumbs({});
      }
    };
    const onReady = () => {
      void capture();
    };
    if (video.readyState >= 2) onReady();
    else video.addEventListener("loadeddata", onReady, { once: true });
    return () => {
      cancelled = true;
    };
  }, [videoUrl, sections, duration]);

  function loadExample() {
    setDuration(EXAMPLE_DURATION);
    setPoints(EXAMPLE_POINTS);
    setSections(autoSections(EXAMPLE_DURATION));
    setSkipRate("11");
    setAvgWatch("14.2");
    setExample(true);
    if (localUrl.current) {
      URL.revokeObjectURL(localUrl.current);
      localUrl.current = null;
    }
    setVideoUrl(HOWTO_VIDEO);
    setVideoLabel("Example how-to");
    setScreen("input");
  }

  function resetBlank() {
    const d = 30;
    setDuration(d);
    setPoints(defaultPoints(d));
    setSections(autoSections(d));
    setSkipRate("");
    setAvgWatch("");
    setExample(false);
    setVideoUrl("");
    setVideoLabel("");
    setThumbs({});
  }

  function setDurationSafe(raw: number) {
    const d = Math.max(3, Math.min(180, raw || 0));
    setDuration(d);
    setExample(false);
    setPoints((prev) => remapPoints(prev, d));
    setSections(autoSections(d));
  }

  function onDropFile(file: File) {
    if (!file.type.startsWith("video/")) return;
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    const url = URL.createObjectURL(file);
    localUrl.current = url;
    setVideoUrl(url);
    setVideoLabel(file.name);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      if (probe.duration && Number.isFinite(probe.duration)) {
        setDurationSafe(Math.round(probe.duration * 10) / 10);
      }
    };
  }

  function updatePoint(index: number, p: number) {
    setExample(false);
    setPoints((prev) => prev.map((pt, i) => (i === index ? { ...pt, p: clampPct(p) } : pt)));
  }

  function runBreakdown() {
    setSections((prev) => (prev.length ? prev : autoSections(duration)));
    setScreen("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function sendEmail() {
    setEmailBusy(true);
    setEmailStatus("");
    const leak = breakdown.topFixes[0] ?? breakdown.sections[0]?.reason ?? "";
    const result = await emailBreakdown({
      email,
      score: String(breakdown.score),
      stage: example ? "Example data" : "Retention breakdown",
      biggestLeak: leak.slice(0, 240),
      biggestFix: (breakdown.topFixes[0] ?? "").slice(0, 240),
      shareUrl: window.location.href,
    });
    setEmailStatus(result.message);
    setEmailBusy(false);
  }

  return (
    <div className="min-h-dvh bg-ink text-cream">
      <video
        ref={videoRef}
        src={videoUrl || undefined}
        poster={videoUrl === HOWTO_VIDEO ? HOWTO_POSTER : undefined}
        muted
        playsInline
        preload="auto"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-6">
        <div>
          <p className="font-display text-[28px] leading-none tracking-wide text-lime">ACCELERATOR</p>
          <p className="mt-1 text-[11px] tracking-[0.18em] text-muted uppercase">
            by Coach Russ / TRIUMFIT
          </p>
        </div>
        <a
          href={MENTORSHIP_URL}
          className="rounded-full border border-cream/20 px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-cream uppercase"
        >
          Book mentorship
        </a>
      </header>

      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-6">
        <p className="mb-3 font-mono text-[11px] tracking-[0.22em] text-muted">[ Retention Breakdown ]</p>
        {screen === "input" ? (
          <InputCard
            duration={duration}
            points={points}
            skipRate={skipRate}
            avgWatch={avgWatch}
            example={example}
            videoLabel={videoLabel}
            onDuration={setDurationSafe}
            onSkipRate={setSkipRate}
            onAvgWatch={setAvgWatch}
            onPoint={updatePoint}
            onExample={loadExample}
            onBlank={resetBlank}
            onDrop={onDropFile}
            onRun={runBreakdown}
          />
        ) : (
          <ResultCard
            breakdown={breakdown}
            points={points}
            thumbs={thumbs}
            videoUrl={videoUrl}
            videoRef={videoRef}
            skipRate={skipRate}
            avgWatch={avgWatch}
            email={email}
            emailStatus={emailStatus}
            emailBusy={emailBusy}
            onEmail={setEmail}
            onSend={sendEmail}
            onSections={setSections}
            onBack={() => setScreen("input")}
          />
        )}
        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted">
          Rules of thumb for coaching, not Meta benchmarks.{" "}
          <a href={SITE_URL} className="text-cream/70 underline decoration-cream/20">
            triumfitcoaching.com
          </a>{" "}
          ·{" "}
          <a href={IG_URL} className="text-cream/70 underline decoration-cream/20">
            @russ_b1
          </a>
        </p>
      </main>
    </div>
  );
}

function InputCard(props: {
  duration: number;
  points: Point[];
  skipRate: string;
  avgWatch: string;
  example: boolean;
  videoLabel: string;
  onDuration: (n: number) => void;
  onSkipRate: (v: string) => void;
  onAvgWatch: (v: string) => void;
  onPoint: (i: number, p: number) => void;
  onExample: () => void;
  onBlank: () => void;
  onDrop: (file: File) => void;
  onRun: () => void;
}) {
  return (
    <section className="rounded-[28px] border border-line bg-card p-5 shadow-[0_0_0_1px_rgba(120,250,61,0.04)]">
      {props.example ? (
        <p className="mb-4 rounded-full bg-lime/15 px-3 py-1.5 text-center text-[11px] font-semibold tracking-[0.16em] text-lime uppercase">
          Example data
        </p>
      ) : null}
      <p className="font-display text-[42px] leading-[0.9] text-cream">
        WHERE DID
        <br />
        THEY DROP?
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        Paste IG reel retention. We walk every section — hook to CTA — with a verdict and one fix.
      </p>

      <label className="mt-6 block font-mono text-[11px] tracking-[0.2em] text-muted">[ Video length ]</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={3}
          max={180}
          value={props.duration}
          onChange={(e) => props.onDuration(Number(e.target.value))}
          className="w-24 rounded-full border border-line bg-ink px-4 py-2.5 text-cream outline-none"
        />
        <span className="text-sm text-muted">seconds</span>
      </div>

      <label className="mt-6 block font-mono text-[11px] tracking-[0.2em] text-muted">[ Retention % ]</label>
      <p className="mt-1 text-[12px] text-muted">0, 1s, 3s, then 10% steps. Drag dots or edit.</p>
      <MiniChart duration={props.duration} points={props.points} onPoint={props.onPoint} />
      <CheckpointTable points={props.points} onPoint={props.onPoint} />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div>
          <label className="block font-mono text-[11px] tracking-[0.2em] text-muted">[ Skip rate ]</label>
          <input
            inputMode="decimal"
            placeholder="optional"
            value={props.skipRate}
            onChange={(e) => props.onSkipRate(e.target.value)}
            className="mt-2 w-full rounded-full border border-line bg-ink px-4 py-2.5 text-cream outline-none"
          />
        </div>
        <div>
          <label className="block font-mono text-[11px] tracking-[0.2em] text-muted">[ Avg watch ]</label>
          <input
            inputMode="decimal"
            placeholder="seconds"
            value={props.avgWatch}
            onChange={(e) => props.onAvgWatch(e.target.value)}
            className="mt-2 w-full rounded-full border border-line bg-ink px-4 py-2.5 text-cream outline-none"
          />
        </div>
      </div>

      <DropZone label={props.videoLabel} onDrop={props.onDrop} />

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={props.onExample}
          className="rounded-full border border-lime/40 px-4 py-2 text-[11px] font-semibold tracking-[0.14em] text-lime uppercase"
        >
          Load example
        </button>
        <button
          type="button"
          onClick={props.onBlank}
          className="rounded-full border border-cream/15 px-4 py-2 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase"
        >
          Start blank
        </button>
      </div>

      <button
        type="button"
        onClick={props.onRun}
        className="mt-6 w-full rounded-full bg-lime py-4 text-[13px] font-bold tracking-[0.18em] text-ink uppercase"
      >
        See my breakdown
      </button>
    </section>
  );
}

function ResultCard(props: {
  breakdown: ReturnType<typeof buildBreakdown>;
  points: Point[];
  thumbs: Record<string, string>;
  videoUrl: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  skipRate: string;
  avgWatch: string;
  email: string;
  emailStatus: string;
  emailBusy: boolean;
  onEmail: (v: string) => void;
  onSend: () => void;
  onSections: (next: Section[]) => void;
  onBack: () => void;
}) {
  const { breakdown } = props;
  return (
    <div className="space-y-4">
      {breakdown.example ? (
        <p className="rounded-full bg-lime/15 px-3 py-1.5 text-center text-[11px] font-semibold tracking-[0.16em] text-lime uppercase">
          Example data
        </p>
      ) : null}

      <section className="rounded-[28px] border border-line bg-card p-5">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted">[ Curve ]</p>
        <ResultChart
          duration={breakdown.duration}
          points={props.points}
          sections={breakdown.sections}
        />
        <p className="mt-2 text-[11px] text-muted">Colored bands = sections. Rules of thumb, not Meta data.</p>
      </section>

      <section className="rounded-[28px] border border-line bg-card p-5">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted">[ Sections ]</p>
        <p className="mt-1 text-[12px] text-muted">Rename, shift a boundary, or note what happens.</p>
        <div className="mt-4 space-y-3">
          {breakdown.sections.map((section, index) => (
            <article key={section.id} className="rounded-[22px] border border-line bg-ink p-4">
              {props.thumbs[section.id] ? (
                <button
                  type="button"
                  className="mb-3 block w-full overflow-hidden rounded-2xl"
                  onClick={() => scrub(props.videoRef.current, section.start)}
                >
                  <img
                    src={props.thumbs[section.id]}
                    alt=""
                    className="h-28 w-full object-cover"
                  />
                </button>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <input
                  value={section.name}
                  onChange={(e) =>
                    props.onSections(
                      breakdown.sections.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)),
                    )
                  }
                  className="w-full bg-transparent font-display text-[26px] leading-none tracking-wide text-cream outline-none"
                />
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] ${VERDICT_STYLE[section.verdict]}`}>
                  {section.verdict}
                </span>
              </div>
              <p className="mt-2 font-mono text-[11px] text-muted">
                {formatTime(section.start)}–{formatTime(section.end)} · {Math.round(section.inPct)}% → {Math.round(section.outPct)}%
              </p>
              {index > 0 ? (
                <label className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                  Start
                  <input
                    type="number"
                    step="0.1"
                    value={section.start}
                    onChange={(e) => shiftBoundary(breakdown.sections, index, Number(e.target.value), props.onSections)}
                    className="w-20 rounded-full border border-line bg-card px-3 py-1 text-cream"
                  />
                </label>
              ) : null}
              <p className="mt-3 text-[12px] font-semibold tracking-[0.08em] text-lime">{section.combo}</p>
              <p className="mt-1 text-[14px] leading-snug text-cream">{section.reason}</p>
              <input
                value={section.note}
                placeholder="what happens here (optional)"
                onChange={(e) =>
                  props.onSections(
                    breakdown.sections.map((s, i) => (i === index ? { ...s, note: e.target.value } : s)),
                  )
                }
                className="mt-3 w-full rounded-full border border-line bg-card px-4 py-2 text-[12px] text-cream outline-none placeholder:text-muted"
              />
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-card p-5">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted">[ Accelerator score ]</p>
        <p className="mt-2 font-display text-[72px] leading-none text-lime">{breakdown.score}</p>
        <p className="text-sm text-muted">/100 · rule of thumb</p>
        {(props.skipRate || props.avgWatch) && (
          <p className="mt-2 text-[12px] text-muted">
            {props.skipRate ? `Skip ${props.skipRate}%` : ""}
            {props.skipRate && props.avgWatch ? " · " : ""}
            {props.avgWatch ? `Avg watch ${props.avgWatch}s` : ""}
          </p>
        )}
        <p className="mt-5 font-mono text-[11px] tracking-[0.2em] text-muted">[ 3 biggest fixes ]</p>
        <ol className="mt-3 space-y-3">
          {breakdown.topFixes.map((fix, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-snug">
              <span className="font-display text-lime">{i + 1}</span>
              <span>{fix}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[28px] border border-line bg-card p-5">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted">[ Email me this breakdown ]</p>
        <p className="mt-1 text-[12px] text-muted">Optional. Same list as Content Score.</p>
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            value={props.email}
            onChange={(e) => props.onEmail(e.target.value)}
            placeholder="you@studio.com"
            className="min-w-0 flex-1 rounded-full border border-line bg-ink px-4 py-3 text-sm text-cream outline-none"
          />
          <button
            type="button"
            disabled={props.emailBusy}
            onClick={props.onSend}
            className="rounded-full bg-cream px-4 py-3 text-[11px] font-bold tracking-[0.12em] text-ink uppercase disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {props.emailStatus ? <p className="mt-2 text-[12px] text-lime">{props.emailStatus}</p> : null}
        <a
          href={MENTORSHIP_URL}
          className="mt-5 flex w-full items-center justify-center rounded-full bg-lime py-4 text-[13px] font-bold tracking-[0.18em] text-ink uppercase"
        >
          Book mentorship
        </a>
        <button
          type="button"
          onClick={props.onBack}
          className="mt-3 w-full rounded-full border border-cream/15 py-3 text-[11px] tracking-[0.16em] text-muted uppercase"
        >
          Edit numbers
        </button>
      </section>
    </div>
  );
}

function MiniChart({
  duration,
  points,
  onPoint,
}: {
  duration: number;
  points: Point[];
  onPoint: (i: number, p: number) => void;
}) {
  const drag = useRef<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const w = 320;
  const h = 128;
  const pad = 14;

  function pos(e: ReactPointerEvent) {
    const rect = svg.current!.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * h;
    return clampPct(100 - ((y - pad) / (h - 2 * pad)) * 100);
  }

  const d = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pad + (pt.t / duration) * (w - 2 * pad)} ${pad + ((100 - pt.p) / 100) * (h - 2 * pad)}`)
    .join(" ");

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${w} ${h}`}
      className="mt-3 w-full touch-none rounded-2xl bg-ink"
      onPointerMove={(e) => {
        if (drag.current === null) return;
        onPoint(drag.current, pos(e));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        drag.current = null;
      }}
    >
      <path d={d} fill="none" stroke="#78fa3d" strokeWidth="2.5" />
      {points.map((pt, i) => (
        <circle
          key={`${pt.t}-${i}`}
          cx={pad + (pt.t / duration) * (w - 2 * pad)}
          cy={pad + ((100 - pt.p) / 100) * (h - 2 * pad)}
          r="6"
          fill="#050505"
          stroke="#78fa3d"
          strokeWidth="2"
          className="cursor-ns-resize"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = i;
          }}
        />
      ))}
    </svg>
  );
}

function ResultChart({
  duration,
  points,
  sections,
}: {
  duration: number;
  points: Point[];
  sections: Section[];
}) {
  const w = 320;
  const h = 140;
  const pad = 12;
  const d = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pad + (pt.t / duration) * (w - 2 * pad)} ${pad + ((100 - pt.p) / 100) * (h - 2 * pad)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full overflow-hidden rounded-2xl bg-ink">
      {sections.map((section) => {
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

function CheckpointTable({ points, onPoint }: { points: Point[]; onPoint: (i: number, p: number) => void }) {
  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      {points.map((pt, i) => (
        <label key={`${pt.t}-${i}`} className="rounded-2xl border border-line bg-ink px-2 py-2">
          <span className="block text-[10px] tracking-[0.12em] text-muted uppercase">{formatTime(pt.t)}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(pt.p)}
            onChange={(e) => onPoint(i, Number(e.target.value))}
            className="w-full bg-transparent text-[15px] text-cream outline-none"
          />
        </label>
      ))}
    </div>
  );
}

function DropZone({ label, onDrop }: { label: string; onDrop: (file: File) => void }) {
  return (
    <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-cream/20 px-4 py-5 text-center">
      <span className="font-mono text-[11px] tracking-[0.2em] text-muted">[ Video file · local only ]</span>
      <span className="mt-1 text-[12px] text-muted">
        {label || "Drop the reel so each section gets a thumbnail. Nothing uploads."}
      </span>
      <input
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onDrop(file);
        }}
      />
    </label>
  );
}

function shiftBoundary(sections: Section[], index: number, start: number, set: (next: Section[]) => void) {
  const next = sections.map((s) => ({ ...s }));
  const prev = next[index - 1];
  const cur = next[index];
  if (!prev || !cur) return;
  const clamped = Math.min(cur.end - 0.3, Math.max(prev.start + 0.3, start));
  prev.end = clamped;
  cur.start = clamped;
  set(next);
}

function clampPct(n: number) {
  return Math.min(100, Math.max(0, n));
}

function remapPoints(prev: Point[], duration: number): Point[] {
  const oldDur = prev[prev.length - 1]?.t || duration;
  const times = defaultPoints(duration).map((p) => p.t);
  return times.map((t) => {
    const mappedT = oldDur ? (t / duration) * oldDur : t;
    const nearest = [...prev].sort((a, b) => Math.abs(a.t - mappedT) - Math.abs(b.t - mappedT))[0];
    return { t, p: nearest?.p ?? 80 };
  });
}

function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    video.currentTime = Math.max(0, Math.min(video.duration || t, t));
    video.addEventListener("seeked", done, { once: true });
    window.setTimeout(done, 400);
  });
}

function scrub(video: HTMLVideoElement | null, t: number) {
  if (!video) return;
  video.currentTime = t;
  void video.play().then(() => {
    window.setTimeout(() => video.pause(), 900);
  });
}
