import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blankDraft, checkDraft, clearDraft, downloadName, draftFromPack, draftToPack, isBlankDraft, loadDraft, moveCard,
  nextCardId, removeCard, saveDraft, slugifyTitle, toJson,
} from "./designer";
import { parsePackJson } from "./pack";
import type { KeyValueStore } from "./storage";
import type { Pack } from "./types";

const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

const sample = (): Pack => {
  const r = parsePackJson(readFileSync(new URL("../../packs/sample.json", import.meta.url), "utf8"));
  if (!r.ok) throw new Error("sample invalid");
  return r.pack;
};

describe("ids", () => {
  it("slugifies titles into valid pack ids", () => {
    expect(slugifyTitle("7th Grade Math — Vocab!")).toBe("7th-grade-math-vocab");
    expect(slugifyTitle("Café Français")).toBe("cafe-francais");
    expect(slugifyTitle("Chapter 1.5")).toBe("chapter-1-5");
    expect(slugifyTitle("!!!")).toBe("");
  });

  it("generates the next card id without reusing or renumbering", () => {
    expect(nextCardId([])).toBe("c1");
    expect(nextCardId([{ id: "c1" }, { id: "c2" }])).toBe("c3");
    expect(nextCardId([{ id: "c1" }, { id: "c5" }])).toBe("c6"); // gap from a deleted card stays a gap
    expect(nextCardId([{ id: "v01" }, { id: "x" }])).toBe("c1"); // imported ids don't affect the counter
  });
});

describe("draft <-> pack", () => {
  it("round-trips the sample pack unchanged", () => {
    const pack = sample();
    expect(draftToPack(draftFromPack(pack))).toEqual(pack);
  });

  it("keeps unknown fields on the pack and on cards", () => {
    const pack = { version: 1, id: "x", title: "T", author: "me", cards: [{ id: "a", q: "q", a: "a", note: "n" }] } as unknown as Pack;
    const out = draftToPack(draftFromPack(pack)) as unknown as Record<string, unknown>;
    expect(out.author).toBe("me");
    expect((out.cards as Record<string, unknown>[])[0]!.note).toBe("n");
  });

  it("parses list fields from text and omits empty optionals", () => {
    const d = blankDraft();
    d.id = "p"; d.title = "P";
    Object.assign(d.cards[0]!, { q: " Q ", a: " A ", choices: "w1\n\n  w2 \n", accept: "", tags: "a, b,,c" });
    const card = draftToPack(d).cards[0]!;
    expect(card).toEqual({ id: "c1", q: "Q", a: "A", choices: ["w1", "w2"], tags: ["a", "b", "c"] });
    expect("accept" in card).toBe(false);
    expect("description" in draftToPack(d)).toBe(false);
  });

  it("exports pretty JSON that parses back to the same pack", () => {
    const pack = sample();
    const text = toJson(pack);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "version": 1');
    const back = parsePackJson(text);
    expect(back.ok && back.pack).toEqual(pack);
  });

  it("names the download after the pack id", () => {
    expect(downloadName({ id: "math-7" })).toBe("math-7.json");
    expect(downloadName({ id: "" })).toBe("pack.json");
  });
});

describe("checkDraft", () => {
  const valid = () => {
    const d = blankDraft();
    d.id = "p"; d.title = "P";
    Object.assign(d.cards[0]!, { q: "2+2", a: "4" });
    return d;
  };

  it("returns the pack when valid", () => {
    const c = checkDraft(valid());
    expect(c.errors).toEqual([]);
    expect(c.pack?.cards).toHaveLength(1);
  });

  it("reports a fresh blank draft as invalid without throwing", () => {
    const c = checkDraft(blankDraft());
    expect(c.pack).toBeUndefined();
    expect(c.errors.join("\n")).toMatch(/title/);
    expect(c.errors.join("\n")).toMatch(/missing "q"/);
  });

  it("flags duplicate ids and bad pack ids", () => {
    const d = valid();
    d.id = "Bad Id";
    d.cards.push({ ...d.cards[0]!, q: "other" });
    const errs = checkDraft(d).errors.join("\n");
    expect(errs).toMatch(/"id" must be/);
    expect(errs).toMatch(/duplicate card id "c1"/);
  });

  it("warns about duplicate questions and answers repeated in choices/accept", () => {
    const d = valid();
    d.cards.push({ ...d.cards[0]!, id: "c2", q: " 2+2 ", choices: "3\n4", accept: "four\n4" });
    const w = checkDraft(d).warnings.join("\n");
    expect(w).toMatch(/same question as card #1/);
    expect(w).toMatch(/"choices" includes the correct answer/);
    expect(w).toMatch(/"accept" repeats the answer/);
    expect(checkDraft(d).pack).toBeDefined(); // warnings don't block export
  });
});

describe("isBlankDraft", () => {
  it("is true for a fresh draft and false once anything is typed", () => {
    const d = blankDraft();
    expect(isBlankDraft(d)).toBe(true);
    d.cards[0]!.tags = "x";
    expect(isBlankDraft(d)).toBe(false);
    expect(isBlankDraft({ ...blankDraft(), title: " T " })).toBe(false);
    expect(isBlankDraft(draftFromPack(sample()))).toBe(false);
  });
});

describe("reordering", () => {
  it("moves and removes without mutating", () => {
    const a = ["a", "b", "c"];
    expect(moveCard(a, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveCard(a, 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveCard(a, 0, 5)).toEqual(a); // out of range is a no-op
    expect(removeCard(a, 1)).toEqual(["a", "c"]);
    expect(a).toEqual(["a", "b", "c"]);
  });
});

describe("draft autosave", () => {
  it("saves, loads and clears", () => {
    const store = memoryStore();
    const d = blankDraft();
    d.title = "WIP";
    expect(saveDraft(store, d)).toBe(true);
    expect(loadDraft(store)?.title).toBe("WIP");
    clearDraft(store);
    expect(loadDraft(store)).toBeUndefined();
  });

  it("ignores corrupt or malformed drafts", () => {
    const store = memoryStore();
    store.setItem("flashcards:draft", "{nope");
    expect(loadDraft(store)).toBeUndefined();
    store.setItem("flashcards:draft", JSON.stringify({ title: 1 }));
    expect(loadDraft(store)).toBeUndefined();
  });
});
