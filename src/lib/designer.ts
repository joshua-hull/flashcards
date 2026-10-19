import type { Card, Pack } from "./types";
import { validatePack } from "./pack";
import { normalize } from "./match";
import type { KeyValueStore } from "./storage";

/** Text-based editing model: list fields are plain strings the form can bind to directly. */
export interface DraftCard {
  id: string;
  q: string;
  a: string;
  choices: string; // one distractor per line
  accept: string; // one alternate answer per line
  tags: string; // comma separated
  extra: Record<string, unknown>; // unknown fields from an imported pack, preserved on export
}

export interface Draft {
  id: string;
  idTouched: boolean; // once the author edits the id, stop deriving it from the title
  title: string;
  description: string;
  cards: DraftCard[];
  extra: Record<string, unknown>;
}

export interface Check {
  errors: string[];
  warnings: string[];
  pack?: Pack; // present only when valid
}

const CARD_KEYS = new Set(["id", "q", "a", "choices", "accept", "tags"]);
const PACK_KEYS = new Set(["version", "id", "title", "description", "cards"]);

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const commas = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

function rest(obj: object, known: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !known.has(k)));
}

/** Pack ids are lowercase letters, digits and hyphens. */
export function slugifyTitle(title: string): string {
  return title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Next unused `c<N>` id. Ids are never reused or renumbered, so removing a card leaves a gap. */
export function nextCardId(cards: readonly { id: string }[]): string {
  const used = new Set(cards.map((c) => c.id));
  let n = Math.max(0, ...cards.map((c) => Number(/^c(\d+)$/.exec(c.id)?.[1] ?? 0)));
  while (used.has(`c${++n}`));
  return `c${n}`;
}

export const blankCard = (cards: readonly { id: string }[]): DraftCard => ({
  id: nextCardId(cards), q: "", a: "", choices: "", accept: "", tags: "", extra: {},
});

export function blankDraft(): Draft {
  return { id: "", idTouched: false, title: "", description: "", cards: [blankCard([])], extra: {} };
}

export function draftFromPack(pack: Pack): Draft {
  return {
    id: pack.id,
    idTouched: true, // an existing pack's id is its identity; never auto-change it
    title: pack.title,
    description: pack.description ?? "",
    cards: pack.cards.map((c: Card) => ({
      id: c.id, q: c.q, a: c.a,
      choices: (c.choices ?? []).join("\n"),
      accept: (c.accept ?? []).join("\n"),
      tags: (c.tags ?? []).join(", "),
      extra: rest(c, CARD_KEYS),
    })),
    extra: rest(pack, PACK_KEYS),
  };
}

/** Build the exportable pack. Optional fields that are empty are omitted; unknown fields are kept. */
export function draftToPack(d: Draft): Pack {
  const cards = d.cards.map((c) => {
    const choices = lines(c.choices), accept = lines(c.accept), tags = commas(c.tags);
    return {
      ...c.extra,
      id: c.id.trim(), q: c.q.trim(), a: c.a.trim(),
      ...(choices.length ? { choices } : {}),
      ...(accept.length ? { accept } : {}),
      ...(tags.length ? { tags } : {}),
    };
  });
  const description = d.description.trim();
  return {
    ...d.extra,
    version: 1,
    id: d.id.trim(),
    title: d.title.trim(),
    ...(description ? { description } : {}),
    cards,
  } as Pack;
}

/** Validate the draft; `warnings` are things that are legal but probably unintended. */
export function checkDraft(d: Draft): Check {
  const candidate = draftToPack(d);
  const result = validatePack(candidate);
  const warnings: string[] = [];

  const seenQ = new Map<string, number>();
  candidate.cards.forEach((c, i) => {
    const at = `Card #${i + 1}`;
    const key = normalize(c.q ?? "");
    if (key) {
      const first = seenQ.get(key);
      if (first !== undefined) warnings.push(`${at} has the same question as card #${first}.`);
      else seenQ.set(key, i + 1);
    }
    const ans = normalize(c.a ?? "");
    if (ans && (c.choices ?? []).some((x) => normalize(x) === ans))
      warnings.push(`${at}: "choices" includes the correct answer; list wrong answers only.`);
    if (ans && (c.accept ?? []).some((x) => normalize(x) === ans))
      warnings.push(`${at}: "accept" repeats the answer; list alternates only.`);
  });

  return result.ok ? { errors: [], warnings, pack: result.pack } : { errors: result.errors, warnings };
}

export const toJson = (pack: Pack): string => JSON.stringify(pack, null, 2) + "\n";

export const downloadName = (pack: Pick<Pack, "id">): string => `${pack.id || "pack"}.json`;

// ---------- reordering (pure; return new arrays) ----------

export function moveCard<T>(cards: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= cards.length || to >= cards.length) return cards.slice();
  const next = cards.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export const removeCard = <T>(cards: readonly T[], index: number): T[] => cards.filter((_, i) => i !== index);

// ---------- autosave so a closed tab doesn't lose work ----------

const DRAFT_KEY = "flashcards:draft";

export function saveDraft(store: KeyValueStore, d: Draft): boolean {
  try {
    store.setItem(DRAFT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(store: KeyValueStore): Draft | undefined {
  try {
    const raw = store.getItem(DRAFT_KEY);
    const d = raw ? (JSON.parse(raw) as Draft) : undefined;
    return d && Array.isArray(d.cards) && typeof d.title === "string" ? d : undefined;
  } catch {
    return undefined;
  }
}

export const clearDraft = (store: KeyValueStore): void => store.removeItem(DRAFT_KEY);
