import { describe, expect, it } from "vitest";
import { backupFilename, buildBackup, mergeBackup, parseBackup } from "./backup";
import {
  applyAnswer, dayNumber, dayToDate, describeDay, dueSummary, newSchedule, qualityFor, review, selectDue, stateOf,
  type Schedule,
} from "./scheduler";
import {
  loadProgress, recordSession, savePack, saveProgress, schedulesOf, type KeyValueStore,
} from "./storage";
import type { Card, Pack } from "./types";

const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const cards: Card[] = ["a", "b", "c", "d"].map((id) => ({ id, q: `q${id}`, a: `a${id}` }));
const pack: Pack = { version: 1, id: "p", title: "P", cards };
const T = 20_000; // an arbitrary "today" day number

describe("days", () => {
  it("round-trips local dates through day numbers and ignores time of day", () => {
    const morning = new Date(2026, 9, 19, 0, 5), night = new Date(2026, 9, 19, 23, 55);
    expect(dayNumber(morning)).toBe(dayNumber(night));
    expect(dayNumber(new Date(2026, 9, 20))).toBe(dayNumber(morning) + 1);
    expect(dayToDate(dayNumber(morning)).getDate()).toBe(19);
  });

  it("is stable across a DST change", () => {
    expect(dayNumber(new Date(2026, 10, 2)) - dayNumber(new Date(2026, 9, 31))).toBe(2);
  });

  it("describes distance in days", () => {
    expect([describeDay(T, T), describeDay(T - 3, T), describeDay(T + 1, T), describeDay(T + 6, T)]).toEqual(["today", "today", "tomorrow", "in 6 days"]);
  });
});

describe("qualityFor", () => {
  it("rates recall above recognition and zero for a miss", () => {
    expect(qualityFor("flip", false)).toBe(1);
    expect(qualityFor("choice", false)).toBe(1);
    expect(qualityFor("flip", true)).toBe(4);
    expect(qualityFor("choice", true)).toBe(3);
    expect(qualityFor("typed", true, "exact")).toBe(5);
    expect(qualityFor("typed", true, "close")).toBe(3);
    expect(qualityFor("typed", false, "wrong")).toBe(1);
  });
});

describe("review (SM-2)", () => {
  it("grows intervals 1 → 6 → interval×ease for good answers, leaving ease unchanged at quality 4", () => {
    let s = newSchedule(T);
    s = review(s, 4, T);
    expect([s.interval, s.reps, s.due, s.ease]).toEqual([1, 1, T + 1, 2.5]);
    s = review(s, 4, T + 1);
    expect([s.interval, s.reps, s.due]).toEqual([6, 2, T + 7]);
    s = review(s, 4, T + 7);
    expect([s.interval, s.reps, s.due]).toEqual([15, 3, T + 22]); // round(6 × 2.5)
  });

  it("raises ease on perfect recall and lowers it on weak recall, never below the floor", () => {
    const base = newSchedule(T);
    expect(review(base, 5, T).ease).toBeCloseTo(2.6);
    expect(review(base, 3, T).ease).toBeCloseTo(2.36);
    let s: Schedule = { ...base, ease: 1.35 };
    for (let i = 0; i < 5; i++) s = review(s, 1, T);
    expect(s.ease).toBe(1.3);
  });

  it("lapses reset repetitions, count the lapse, and bring the card back tomorrow", () => {
    const learned: Schedule = { ease: 2.5, interval: 15, reps: 3, lapses: 0, due: T };
    const s = review(learned, 1, T);
    expect(s).toMatchObject({ reps: 0, interval: 1, lapses: 1, due: T + 1 });
    expect(s.ease).toBeCloseTo(2.3);
  });

  it("always advances the interval by at least a day", () => {
    const s = review({ ease: 1.3, interval: 1, reps: 2, lapses: 0, due: T }, 3, T);
    expect(s.interval).toBeGreaterThanOrEqual(2);
  });

  it("does not mutate its input", () => {
    const s = newSchedule(T);
    review(s, 5, T);
    expect(s).toEqual(newSchedule(T));
  });
});

describe("applyAnswer", () => {
  it("starts a new card's schedule on its first answer", () => {
    expect(applyAnswer(undefined, 4, T)).toMatchObject({ reps: 1, due: T + 1 });
    expect(applyAnswer(undefined, 1, T)).toMatchObject({ reps: 0, lapses: 1, due: T + 1 });
  });

  it("leaves a not-yet-due card alone when answered correctly (studying ahead)", () => {
    const s: Schedule = { ease: 2.5, interval: 6, reps: 2, lapses: 0, due: T + 5 };
    expect(applyAnswer(s, 5, T)).toBe(s);
  });

  it("still lapses a not-yet-due card that is answered wrong", () => {
    const s: Schedule = { ease: 2.5, interval: 6, reps: 2, lapses: 0, due: T + 5 };
    expect(applyAnswer(s, 1, T)).toMatchObject({ reps: 0, lapses: 1, due: T + 1 });
  });
});

describe("due selection", () => {
  const sched: Record<string, Schedule | undefined> = {
    a: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: T - 3 }, // overdue
    b: { ease: 2.5, interval: 6, reps: 2, lapses: 0, due: T + 4 }, // upcoming
    c: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: T }, // due today
    // d: new
  };

  it("classifies cards", () => {
    expect(["a", "b", "c", "d"].map((id) => stateOf(sched[id], T))).toEqual(["due", "upcoming", "due", "new"]);
  });

  it("summarizes counts and the next upcoming day", () => {
    expect(dueSummary(cards, sched, T)).toEqual({ newCount: 1, dueCount: 2, upcomingCount: 1, nextDue: T + 4 });
  });

  it("selects the most overdue first, then new cards up to the limit", () => {
    expect(selectDue(cards, sched, T).map((c) => c.id)).toEqual(["a", "c", "d"]);
    expect(selectDue(cards, sched, T, 0).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("returns nothing when everything is scheduled for later", () => {
    const later = Object.fromEntries(cards.map((c) => [c.id, { ease: 2.5, interval: 6, reps: 2, lapses: 0, due: T + 2 }]));
    expect(selectDue(cards, later, T)).toEqual([]);
  });
});

describe("scheduling in storage", () => {
  const day = (n: number) => new Date(2026, 9, 1 + n, 12).getTime();

  it("records schedules from answers and honours explicit quality", () => {
    const store = memoryStore();
    const p = recordSession(store, "p", [{ cardId: "a", correct: true, quality: 5 }, { cardId: "b", correct: false }], day(0));
    expect(p.cards.a!.sched).toMatchObject({ reps: 1, interval: 1 });
    expect(p.cards.a!.sched!.ease).toBeCloseTo(2.6);
    expect(p.cards.b!.sched).toMatchObject({ reps: 0, lapses: 1 });
  });

  it("advances a card only when it is due", () => {
    const store = memoryStore();
    recordSession(store, "p", [{ cardId: "a", correct: true }], day(0)); // due day 1
    const sameDay = recordSession(store, "p", [{ cardId: "a", correct: true }], day(0));
    expect(sameDay.cards.a!.sched!.reps).toBe(1); // "again, all cards" doesn't inflate it
    expect(sameDay.cards.a!.seen).toBe(2); // but the answer is still counted
    const nextDay = recordSession(store, "p", [{ cardId: "a", correct: true }], day(1));
    expect(nextDay.cards.a!.sched).toMatchObject({ reps: 2, interval: 6 });
  });

  it("treats progress recorded before M3 as due today, and unseen cards as new", () => {
    const legacy = { sessions: 1, cards: { a: { seen: 2, correct: 1, last: true, at: 1 } } };
    const s = schedulesOf(legacy, T);
    expect(stateOf(s.a, T)).toBe("due");
    expect(s.b).toBeUndefined();
    const store = memoryStore();
    saveProgress(store, "p", legacy);
    const after = recordSession(store, "p", [{ cardId: "a", correct: true }], day(0));
    expect(after.cards.a!.sched).toMatchObject({ reps: 1 });
  });
});

describe("backup", () => {
  const seeded = () => {
    const store = memoryStore();
    savePack(store, pack);
    recordSession(store, "p", [{ cardId: "a", correct: true }, { cardId: "b", correct: false }], 1000);
    return store;
  };

  it("round-trips through JSON into an empty browser", () => {
    const parsed = parseBackup(JSON.stringify(buildBackup(seeded(), new Date(2026, 9, 19))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const fresh = memoryStore();
    expect(mergeBackup(fresh, parsed.backup)).toEqual({ packsAdded: 1, packsKept: 0, cardsImported: 2, cardsKept: 0 });
    expect(loadProgress(fresh, "p")).toEqual(loadProgress(seeded(), "p"));
  });

  it("names the file by local date", () => {
    expect(backupFilename(new Date(2026, 0, 5))).toBe("flashcards-backup-2026-01-05.json");
  });

  it("keeps whichever side answered most recently, per card", () => {
    const store = memoryStore();
    savePack(store, pack);
    saveProgress(store, "p", { sessions: 5, cards: {
      a: { seen: 9, correct: 9, last: true, at: 5000 }, // local newer
      b: { seen: 1, correct: 0, last: false, at: 100 }, // local older
    } });
    const backup = buildBackup(seeded()); // a@1000, b@1000
    const summary = mergeBackup(store, backup);
    expect(summary).toMatchObject({ packsAdded: 0, packsKept: 1, cardsImported: 1, cardsKept: 1 });
    const p = loadProgress(store, "p");
    expect(p.cards.a!.seen).toBe(9);
    expect(p.cards.b!.at).toBe(1000);
    expect(p.sessions).toBe(5); // max, not sum, so restoring on the same browser doesn't double-count
  });

  it("rejects files that aren't backups, with readable errors", () => {
    expect(parseBackup("{nope").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: "other" })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: "flashcards", version: 2, packs: [] })).ok).toBe(false);
    const bad = parseBackup(JSON.stringify({ app: "flashcards", version: 1, packs: [
      { pack, progress: { sessions: 1, cards: { a: { seen: "x" } } } },
      { pack: { version: 1, id: "Bad Id", title: "t", cards: [] }, progress: { sessions: 0, cards: {} } },
    ] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join("\n")).toMatch(/progress for card "a"/);
      expect(bad.errors.join("\n")).toMatch(/Backup pack #2/);
    }
  });
});
