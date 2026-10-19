import { describe, expect, it } from "vitest";
import { currentCard, isDone, record, startSession, summarize } from "./session";
import {
  forgetPack, listPackIds, loadPack, loadProgress, mastery, recordSession, resetProgress, savePack, weakCardIds,
  type KeyValueStore,
} from "./storage";
import type { Card, Pack } from "./types";

const cards: Card[] = ["a", "b", "c"].map((id) => ({ id, q: `q${id}`, a: `a${id}` }));
const pack: Pack = { version: 1, id: "p", title: "P", cards };

function memoryStore(failWrites = false): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { if (failWrites) throw new Error("quota"); m.set(k, v); },
    removeItem: (k) => void m.delete(k),
  };
}

describe("session", () => {
  it("walks the deck, records answers, and summarizes missed cards", () => {
    let s = startSession(cards, "flip");
    expect(s.deck).toHaveLength(3);
    const order = s.deck.map((c) => c.id);
    s = record(s, false);
    s = record(s, true);
    s = record(s, true);
    expect(isDone(s)).toBe(true);
    expect(currentCard(s)).toBeUndefined();
    expect(summarize(s)).toMatchObject({ total: 3, right: 2 });
    expect(summarize(s).missed.map((c) => c.id)).toEqual([order[0]]);
  });

  it("ignores record() after the deck is finished", () => {
    let s = startSession([cards[0]!], "typed");
    s = record(s, true);
    expect(record(s, false)).toBe(s);
  });

  it("does not mutate the input deck", () => {
    const input = [...cards];
    startSession(input, "choice");
    expect(input).toEqual(cards);
  });
});

describe("storage", () => {
  it("returns empty progress when nothing is stored or data is corrupt", () => {
    const store = memoryStore();
    expect(loadProgress(store, "p")).toEqual({ sessions: 0, cards: {} });
    store.setItem("flashcards:progress:p", "{not json");
    expect(loadProgress(store, "p").sessions).toBe(0);
  });

  it("accumulates results across sessions keyed by card id", () => {
    const store = memoryStore();
    recordSession(store, "p", [{ cardId: "a", correct: false }, { cardId: "b", correct: true }], 100);
    const p = recordSession(store, "p", [{ cardId: "a", correct: true }], 200);
    expect(p.sessions).toBe(2);
    expect(p.cards.a).toMatchObject({ seen: 2, correct: 1, last: true, at: 200 });
    expect(p.cards.a!.sched).toBeDefined();
    expect(loadProgress(store, "p")).toEqual(p);
  });

  it("finds weak cards and mastery, ignoring ids no longer in the pack", () => {
    const store = memoryStore();
    const p = recordSession(store, "p", [
      { cardId: "a", correct: false }, { cardId: "b", correct: true }, { cardId: "gone", correct: false },
    ]);
    expect(weakCardIds(p, pack)).toEqual(["a"]);
    expect(mastery(p, pack)).toEqual({ total: 3, studied: 2, mastered: 1 });
  });

  it("resets progress for one pack only", () => {
    const store = memoryStore();
    recordSession(store, "p", [{ cardId: "a", correct: true }]);
    recordSession(store, "other", [{ cardId: "a", correct: true }]);
    resetProgress(store, "p");
    expect(loadProgress(store, "p").sessions).toBe(0);
    expect(loadProgress(store, "other").sessions).toBe(1);
  });

  it("remembers and forgets packs", () => {
    const store = memoryStore();
    expect(savePack(store, pack)).toBe(true);
    expect(savePack(store, pack)).toBe(true);
    expect(listPackIds(store)).toEqual(["p"]);
    expect(loadPack(store, "p")).toEqual(pack);
    recordSession(store, "p", [{ cardId: "a", correct: true }]);
    forgetPack(store, "p");
    expect(listPackIds(store)).toEqual([]);
    expect(loadPack(store, "p")).toBeUndefined();
    expect(loadProgress(store, "p").sessions).toBe(0);
  });

  it("reports failed writes instead of throwing", () => {
    expect(savePack(memoryStore(true), pack)).toBe(false);
    expect(() => recordSession(memoryStore(true), "p", [{ cardId: "a", correct: true }])).not.toThrow();
  });
});
