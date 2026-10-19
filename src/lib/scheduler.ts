import type { Card } from "./types";

/**
 * SM-2 spaced repetition (SuperMemo 2), adapted for this app's pass/fail answers.
 *
 * FSRS was evaluated and deferred: it needs four-way ratings (again/hard/good/easy) and a fitted
 * parameter set to beat SM-2, but every mode here yields a binary result. SM-2 is simple, predictable,
 * and good enough; revisit if a richer grading UI is added.
 */

export interface Schedule {
  ease: number; // ease factor, never below MIN_EASE
  interval: number; // days until the next review after the last success
  reps: number; // consecutive successful reviews
  lapses: number; // times the card was forgotten after being learned
  due: number; // day number (see dayNumber) on which the card is next due
}

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const NEW_PER_SESSION = 20;

/** SM-2 quality 0-5. Wrong answers are 1; successes depend on how strong the recall signal was. */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** Local calendar day as an integer (days since 1970-01-01, using the local y/m/d), so DST can't shift it. */
export function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export const dayToDate = (day: number): Date => {
  const d = new Date(day * 86_400_000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export const newSchedule = (today: number): Schedule => ({ ease: DEFAULT_EASE, interval: 0, reps: 0, lapses: 0, due: today });

/**
 * Map an answer to a quality. Typed recall is stronger evidence than recognising an option, so an exact
 * typed answer is 5 and a correct multiple-choice pick is 3 (slightly slows interval growth).
 */
export function qualityFor(mode: "flip" | "choice" | "typed", correct: boolean, verdict?: "exact" | "close" | "wrong"): Quality {
  if (!correct) return 1;
  if (mode === "typed") return verdict === "close" ? 3 : 5;
  return mode === "choice" ? 3 : 4;
}

/** Apply one review. Does not mutate `s`. */
export function review(s: Schedule, quality: Quality, today: number): Schedule {
  if (quality < 3) {
    // lapse: relearn tomorrow, and make the card a little harder
    return { ease: Math.max(MIN_EASE, s.ease - 0.2), interval: 1, reps: 0, lapses: s.lapses + 1, due: today + 1 };
  }
  const interval = s.reps === 0 ? 1 : s.reps === 1 ? 6 : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
  const q = 5 - quality;
  const ease = Math.max(MIN_EASE, s.ease + 0.1 - q * (0.08 + q * 0.02));
  return { ease, interval, reps: s.reps + 1, lapses: s.lapses, due: today + interval };
}

/**
 * Fold an answer into a card's schedule. A card studied ahead of schedule keeps its date when answered
 * correctly (so "again, all cards" can't inflate intervals) but still lapses when answered wrong.
 */
export function applyAnswer(s: Schedule | undefined, quality: Quality, today: number): Schedule {
  const cur = s ?? newSchedule(today);
  if (quality >= 3 && cur.due > today) return cur;
  return review(cur, quality, today);
}

export type CardState = "new" | "due" | "upcoming";

export function stateOf(s: Schedule | undefined, today: number): CardState {
  if (!s) return "new";
  return s.due <= today ? "due" : "upcoming";
}

export interface DueSummary {
  newCount: number;
  dueCount: number;
  upcomingCount: number;
  nextDue?: number; // earliest day among upcoming cards
}

export function dueSummary(cards: readonly Card[], schedules: Record<string, Schedule | undefined>, today: number): DueSummary {
  const out: DueSummary = { newCount: 0, dueCount: 0, upcomingCount: 0 };
  for (const c of cards) {
    const s = schedules[c.id];
    const state = stateOf(s, today);
    if (state === "new") out.newCount++;
    else if (state === "due") out.dueCount++;
    else {
      out.upcomingCount++;
      out.nextDue = Math.min(out.nextDue ?? Infinity, s!.due);
    }
  }
  return out;
}

/** Cards for a due-today session: everything due (most overdue first), then up to `newLimit` unseen cards. */
export function selectDue(
  cards: readonly Card[],
  schedules: Record<string, Schedule | undefined>,
  today: number,
  newLimit = NEW_PER_SESSION,
): Card[] {
  const due = cards
    .filter((c) => stateOf(schedules[c.id], today) === "due")
    .sort((a, b) => schedules[a.id]!.due - schedules[b.id]!.due);
  const fresh = cards.filter((c) => stateOf(schedules[c.id], today) === "new").slice(0, newLimit);
  return [...due, ...fresh];
}

/** Human wording for how far away a day is, e.g. "tomorrow" or "in 6 days". */
export function describeDay(day: number, today: number): string {
  const n = day - today;
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}
