import type { Pack } from "./types";
import { applyAnswer, dayNumber, newSchedule, type Quality, type Schedule } from "./scheduler";

/** The subset of the Web Storage API we use, so tests can pass an in-memory fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CardProgress {
  seen: number;
  correct: number;
  last: boolean;
  at: number;
  sched?: Schedule; // absent on progress recorded before spaced repetition existed
}

export interface PackProgress {
  sessions: number;
  cards: Record<string, CardProgress>;
}

const PREFIX = "flashcards:";
const progressKey = (packId: string) => `${PREFIX}progress:${packId}`;
const packKey = (packId: string) => `${PREFIX}pack:${packId}`;
const INDEX_KEY = `${PREFIX}packs`;

export const emptyProgress = (): PackProgress => ({ sessions: 0, cards: {} });

function readJson<T>(store: KeyValueStore, key: string): T | undefined {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined; // missing, corrupt, or storage blocked
  }
}

/** Writes can fail (quota, private mode); progress is a convenience so report instead of throwing. */
function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadProgress = (store: KeyValueStore, packId: string): PackProgress =>
  readJson<PackProgress>(store, progressKey(packId)) ?? emptyProgress();

/** Fold a finished session into stored progress. Keyed by card id, so edits to pack order are harmless. */
export function recordSession(
  store: KeyValueStore,
  packId: string,
  answers: readonly { cardId: string; correct: boolean; quality?: Quality }[],
  now = Date.now(),
): PackProgress {
  const progress = loadProgress(store, packId);
  const today = dayNumber(new Date(now));
  progress.sessions += 1;
  for (const { cardId, correct, quality } of answers) {
    const prev = progress.cards[cardId] ?? { seen: 0, correct: 0, last: false, at: 0 };
    const known = prev.sched ?? (prev.seen > 0 ? newSchedule(today) : undefined); // legacy progress counts as due
    progress.cards[cardId] = {
      seen: prev.seen + 1,
      correct: prev.correct + (correct ? 1 : 0),
      last: correct,
      at: now,
      sched: applyAnswer(known, quality ?? (correct ? 4 : 1), today),
    };
  }
  saveProgress(store, packId, progress);
  return progress;
}

/** Overwrite a pack's stored progress. Returns false if the browser refused the write. */
export const saveProgress = (store: KeyValueStore, packId: string, progress: PackProgress): boolean =>
  writeJson(store, progressKey(packId), progress);

export const resetProgress = (store: KeyValueStore, packId: string): void => store.removeItem(progressKey(packId));

/** Schedules by card id for the scheduler. Cards studied before spaced repetition existed count as due today. */
export function schedulesOf(progress: PackProgress, today: number): Record<string, Schedule> {
  return Object.fromEntries(
    Object.entries(progress.cards)
      .filter(([, p]) => p.sched || p.seen > 0)
      .map(([id, p]) => [id, p.sched ?? newSchedule(today)]),
  );
}

/** Cards whose most recent answer was wrong. Ids not in the pack are ignored. */
export function weakCardIds(progress: PackProgress, pack: Pack): string[] {
  const ids = new Set(pack.cards.map((c) => c.id));
  return Object.entries(progress.cards)
    .filter(([id, p]) => ids.has(id) && !p.last)
    .map(([id]) => id);
}

export interface Mastery {
  studied: number;
  total: number;
  mastered: number;
}

/** A card counts as mastered when its latest answer was right. */
export function mastery(progress: PackProgress, pack: Pack): Mastery {
  const entries = pack.cards.map((c) => progress.cards[c.id]);
  return {
    total: pack.cards.length,
    studied: entries.filter(Boolean).length,
    mastered: entries.filter((p) => p?.last).length,
  };
}

/** Remember uploaded packs so they survive a reload. Returns false if the browser refused. */
export function savePack(store: KeyValueStore, pack: Pack): boolean {
  const ok = writeJson(store, packKey(pack.id), pack);
  if (!ok) return false;
  const ids = listPackIds(store);
  if (!ids.includes(pack.id)) writeJson(store, INDEX_KEY, [...ids, pack.id]);
  return true;
}

export const listPackIds = (store: KeyValueStore): string[] => readJson<string[]>(store, INDEX_KEY) ?? [];

export const loadPack = (store: KeyValueStore, packId: string): Pack | undefined => readJson<Pack>(store, packKey(packId));

/** Remove a pack and its progress. */
export function forgetPack(store: KeyValueStore, packId: string): void {
  store.removeItem(packKey(packId));
  store.removeItem(progressKey(packId));
  writeJson(store, INDEX_KEY, listPackIds(store).filter((id) => id !== packId));
}
