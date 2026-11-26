export type InsightsRow = {
  caption: string;
  postedAt: Date | null;
  type: string;
  views: number | null;
  reach: number | null;
  duration: number | null;
  avgWatch: number | null;
  skipRate: number | null;
};

export type CsvKind = "meta_business_suite" | "youtube_studio" | "tiktok" | "instagram_insights";

export type ParsedCsv = {
  kind: CsvKind;
  rows: InsightsRow[];
  picked: InsightsRow | null;
  fileName: string;
};

const ROLE_ALIASES: Record<string, string[]> = {
  date: ["post time", "posted", "date", "publish time", "published", "timestamp", "post date", "created", "creation time"],
  caption: ["caption", "recent content", "post message", "description", "title", "video title", "content", "video", "permalink"],
  type: ["content type", "post type", "type", "format", "media product type"],
  views: ["views", "total views", "plays", "reel plays", "video views", "impressions", "total impressions"],
  reach: ["reach", "accounts reached", "viewers", "unique accounts"],
  duration: ["duration", "video length", "video length seconds", "length", "length seconds", "video duration"],
  avgWatch: [
    "average watch time",
    "avg watch time",
    "average view duration",
    "average view duration seconds",
    "avg watch",
    "average watch time seconds",
    "total play time",
  ],
  skipRate: ["skip rate", "skipped", "skip", "skip percent", "3 second skip"],
};

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') inQuotes = false;
      else cell += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[_/|]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roleForHeader(header: string): string | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.includes(normalized)) return role;
  }
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.some((alias) => normalized.endsWith(" " + alias) && normalized !== alias)) {
      if (role === "duration" && /average|avg|watch|view duration/.test(normalized)) continue;
      return role;
    }
  }
  return null;
}

function mapHeaders(headers: string[]): Record<string, number> {
  const mapped: Record<string, number> = {};
  headers.forEach((header, index) => {
    const role = roleForHeader(header);
    if (!role || mapped[role] !== undefined) return;
    mapped[role] = index;
  });
  return mapped;
}

export function parseNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "n/a") return null;
  const time = trimmed.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (time) {
    const a = Number(time[1]);
    const b = Number(time[2]);
    const c = time[3] ? Number(time[3]) : 0;
    return time[3] ? a * 3600 + b * 60 + c : a * 60 + b;
  }
  const cleaned = trimmed.replace(/[%$,]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = Date.parse(value);
  return Number.isNaN(iso) ? null : new Date(iso);
}

function detectKind(headers: string[]): CsvKind {
  const joined = headers.map((h) => h.toLowerCase()).join(" | ");
  if (joined.includes("average view duration") || joined.includes("impressions click-through")) return "youtube_studio";
  if (joined.includes("full video watched") || joined.includes("total play time")) return "tiktok";
  if (joined.includes("likes and reactions") || joined.includes("sticker taps") || joined.includes("cost per result")) {
    return "meta_business_suite";
  }
  if (joined.includes("accounts reached") || joined.includes("saves")) return "instagram_insights";
  return "meta_business_suite";
}

function headerScore(cells: string[]): number {
  const mapped = mapHeaders(cells);
  let score = Object.keys(mapped).length;
  if (mapped.date != null) score += 2;
  if (mapped.views != null || mapped.reach != null) score += 3;
  return score;
}

function findHeaderRow(rows: string[][]): number {
  let bestIndex = 0;
  let bestScore = -1;
  const scan = Math.min(rows.length, 25);
  for (let i = 0; i < scan; i++) {
    const score = headerScore(rows[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 2 ? bestIndex : 0;
}

export function parseInsightsCsv(text: string, fileName = "insights.csv"): ParsedCsv {
  const table = parseCsvText(text);
  if (table.length === 0) throw new Error("Couldn't read that CSV.");
  const headerIndex = findHeaderRow(table);
  const headers = table[headerIndex] ?? [];
  const mapped = mapHeaders(headers);
  if (mapped.date == null && mapped.views == null && mapped.reach == null && mapped.caption == null && mapped.avgWatch == null) {
    throw new Error("Couldn't read that CSV.");
  }
  const kind = detectKind(headers);
  const rows: InsightsRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i++) {
    const row = table[i] ?? [];
    if (row.every((cell) => !cell)) continue;
    rows.push({
      caption: mapped.caption != null ? row[mapped.caption] ?? "" : "",
      postedAt: mapped.date != null ? parseDate(row[mapped.date]) : null,
      type: mapped.type != null ? row[mapped.type] ?? "" : "",
      views: mapped.views != null ? parseNumber(row[mapped.views]) : null,
      reach: mapped.reach != null ? parseNumber(row[mapped.reach]) : null,
      duration: mapped.duration != null ? parseNumber(row[mapped.duration]) : null,
      avgWatch: mapped.avgWatch != null ? parseNumber(row[mapped.avgWatch]) : null,
      skipRate: mapped.skipRate != null ? parseNumber(row[mapped.skipRate]) : null,
    });
  }
  return { kind, rows, picked: pickRow(rows, null), fileName };
}

export function pickRow(rows: InsightsRow[], videoDuration: number | null, captionHint = ""): InsightsRow | null {
  if (rows.length === 0) return null;
  const reels = rows.filter((row) => /reel|video|short/i.test(row.type) || !row.type);
  const pool = reels.length ? reels : rows;
  if (videoDuration && videoDuration > 1) {
    const close = [...pool]
      .filter((row) => row.duration != null)
      .sort((a, b) => Math.abs((a.duration ?? 0) - videoDuration) - Math.abs((b.duration ?? 0) - videoDuration));
    if (close[0] && Math.abs((close[0].duration ?? 0) - videoDuration) <= 2) return close[0];
  }
  const hint = captionHint.trim().toLowerCase();
  if (hint) {
    const hit = pool.find((row) => row.caption.toLowerCase().includes(hint) || hint.includes(row.caption.toLowerCase().slice(0, 18)));
    if (hit) return hit;
  }
  return [...pool].sort((a, b) => (b.views ?? b.reach ?? 0) - (a.views ?? a.reach ?? 0))[0] ?? pool[0];
}
