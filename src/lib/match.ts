import type { Card } from "./types";

/**
 * Canonical form for comparing answers: lowercase, no accents, dash variants (hyphen, en/em dash, U+2212
 * minus) unified, punctuation dropped except math symbols, and no spaces around those symbols
 * (so `4x + 8` equals `4x+8` and `−3` equals `-3`).
 */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[^\p{L}\p{N}\s.\-+/^%=×÷*<>≤≥()]/gu, "")
    .replace(/\s*([-+/^%=×÷*<>≤≥()])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Typos allowed for an expected answer of this length. Short answers (numbers, symbols) must be exact. */
export function allowedEdits(len: number): number {
  if (len <= 4) return 0;
  if (len <= 9) return 1;
  return 2;
}

export type Verdict = "exact" | "close" | "wrong";

/** Grade a typed answer against the card's answer and its `accept` alternates. */
export function checkTyped(input: string, card: Pick<Card, "a" | "accept">): Verdict {
  const got = normalize(input);
  if (!got) return "wrong";
  let close = false;
  for (const target of [card.a, ...(card.accept ?? [])].map(normalize)) {
    if (got === target) return "exact";
    if (levenshtein(got, target) <= allowedEdits(target.length)) close = true;
  }
  return close ? "close" : "wrong";
}
