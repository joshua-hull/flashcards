import { validatePack } from "./pack";
import {
  listPackIds, loadPack, loadProgress, savePack, saveProgress, type CardProgress, type KeyValueStore, type PackProgress,
} from "./storage";
import type { Pack } from "./types";

/** A portable snapshot of every saved pack and its progress, for moving between browsers or backing up. */
export interface Backup {
  app: "flashcards";
  version: 1;
  exportedAt: string;
  packs: { pack: Pack; progress: PackProgress }[];
}

export type BackupParse = { ok: true; backup: Backup } | { ok: false; errors: string[] };

export interface MergeSummary {
  packsAdded: number;
  packsKept: number; // already present locally; the local pack definition wins
  cardsImported: number; // cards whose imported progress was newer or new
  cardsKept: number; // cards where local progress was as new or newer
}

export function buildBackup(store: KeyValueStore, now: Date = new Date()): Backup {
  const packs = listPackIds(store)
    .map((id) => loadPack(store, id))
    .filter((p): p is Pack => !!p)
    .map((pack) => ({ pack, progress: loadProgress(store, pack.id) }));
  return { app: "flashcards", version: 1, exportedAt: now.toISOString(), packs };
}

export const backupFilename = (now: Date = new Date()): string =>
  `flashcards-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function cardProgressProblem(p: unknown): string | null {
  if (!isObject(p)) return "is not an object";
  if (![p.seen, p.correct, p.at].every(isNum) || typeof p.last !== "boolean") return "needs numeric seen/correct/at and boolean last";
  if (p.sched !== undefined) {
    const s = p.sched;
    if (!isObject(s) || ![s.ease, s.interval, s.reps, s.lapses, s.due].every(isNum)) return "has an invalid schedule";
  }
  return null;
}

export function parseBackup(text: string): BackupParse {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  if (!isObject(data) || data.app !== "flashcards") return { ok: false, errors: ["This isn't a Flashcards backup file."] };
  if (data.version !== 1) return { ok: false, errors: [`Unsupported backup version: ${JSON.stringify(data.version)}.`] };
  if (!Array.isArray(data.packs)) return { ok: false, errors: ['Backup is missing its "packs" list.'] };

  const errors: string[] = [];
  const packs: Backup["packs"] = [];
  data.packs.forEach((entry, i) => {
    const at = `Backup pack #${i + 1}`;
    if (!isObject(entry)) return errors.push(`${at} is not an object.`);
    const parsed = validatePack(entry.pack);
    if (!parsed.ok) return errors.push(...parsed.errors.map((e) => `${at}: ${e}`));
    const progress = entry.progress;
    if (!isObject(progress) || !isNum(progress.sessions) || !isObject(progress.cards))
      return errors.push(`${at} ("${parsed.pack.id}"): progress is malformed.`);
    for (const [id, p] of Object.entries(progress.cards)) {
      const problem = cardProgressProblem(p);
      if (problem) return errors.push(`${at} ("${parsed.pack.id}"): progress for card "${id}" ${problem}.`);
    }
    packs.push({ pack: parsed.pack, progress: progress as unknown as PackProgress });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, backup: { app: "flashcards", version: 1, exportedAt: String(data.exportedAt ?? ""), packs } };
}

/**
 * Merge a backup into this browser. New packs are added; packs that already exist keep their local
 * definition. Progress merges per card, keeping whichever side answered most recently, so restoring an
 * old backup can't overwrite newer local progress.
 */
export function mergeBackup(store: KeyValueStore, backup: Backup): MergeSummary {
  const out: MergeSummary = { packsAdded: 0, packsKept: 0, cardsImported: 0, cardsKept: 0 };
  for (const { pack, progress } of backup.packs) {
    if (listPackIds(store).includes(pack.id)) out.packsKept++;
    else if (savePack(store, pack)) out.packsAdded++;

    const local = loadProgress(store, pack.id);
    const merged: Record<string, CardProgress> = { ...local.cards };
    for (const [id, incoming] of Object.entries(progress.cards)) {
      const mine = local.cards[id];
      if (!mine || incoming.at > mine.at) { merged[id] = incoming; out.cardsImported++; }
      else out.cardsKept++;
    }
    const result: PackProgress = { sessions: Math.max(local.sessions, progress.sessions), cards: merged };
    saveProgress(store, pack.id, result); // on a refused write local progress is simply left as it was
  }
  return out;
}
