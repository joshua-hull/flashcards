import type { Pack } from "./types";
import { validatePack, type ParseResult } from "./pack";

/** RFC 4180-style parser: quoted fields, escaped quotes (""), and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Small stable string hash (FNV-1a), base36, for deriving card ids from question text. */
export function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "c" + (h >>> 0).toString(36);
}

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pack";

/**
 * Convert CSV text to a pack. Columns: q, a, optional tags (separated by ";") and id.
 * A header row is detected when the first row is exactly the column names; otherwise
 * columns are positional q,a,tags. Missing ids are derived from a hash of the question.
 */
export function csvToPack(text: string, filename = "pack.csv"): ParseResult {
  const rows = parseCsv(text);
  if (!rows.length) return { ok: false, errors: ["CSV is empty."] };

  const names = rows[0]!.map((h) => h.trim().toLowerCase());
  const hasHeader = names.includes("q") && names.includes("a");
  const col = (name: string, fallback: number) => (hasHeader ? names.indexOf(name) : fallback);
  const [qi, ai, ti, ii] = [col("q", 0), col("a", 1), col("tags", 2), col("id", -1)];
  const body = hasHeader ? rows.slice(1) : rows;

  const used = new Set<string>();
  const cards: Pack["cards"] = body.map((r) => {
    const q = (r[qi] ?? "").trim();
    const a = (r[ai] ?? "").trim();
    let id = ii >= 0 ? (r[ii] ?? "").trim() : "";
    if (!id) {
      id = hashId(q);
      for (let n = 2; used.has(id); n++) id = `${hashId(q)}-${n}`; // identical questions
    }
    used.add(id);
    const tags = ti >= 0 ? (r[ti] ?? "").split(";").map((t) => t.trim()).filter(Boolean) : [];
    return { id, q, a, ...(tags.length ? { tags } : {}) };
  });

  const title = filename.replace(/\.[a-z0-9]+$/i, "").trim() || "Untitled pack";
  return validatePack({ version: 1, id: slugify(filename), title, cards });
}
