import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildChoices } from "./choices";
import { csvToPack, hashId, parseCsv } from "./csv";
import { allowedEdits, checkTyped, levenshtein, normalize } from "./match";
import { parsePackJson, validatePack } from "./pack";
import { shuffle } from "./shuffle";
import type { Card } from "./types";

const card = (id: string, a: string, extra: Partial<Card> = {}): Card => ({ id, q: `q-${id}`, a, ...extra });
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe("validatePack", () => {
  it("accepts the sample pack", () => {
    const text = readFileSync(new URL("../../packs/sample.json", import.meta.url), "utf8");
    const r = parsePackJson(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack.cards).toHaveLength(20);
  });

  it("collects every problem, not just the first", () => {
    const r = validatePack({ version: 2, id: "Bad Id", cards: [{ id: "a", q: "q" }, { id: "a", q: "q", a: "x" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/version/);
      expect(r.errors.join("\n")).toMatch(/"id" must be/);
      expect(r.errors.join("\n")).toMatch(/title/);
      expect(r.errors.join("\n")).toMatch(/missing "a"/);
      expect(r.errors.join("\n")).toMatch(/duplicate card id "a"/);
    }
  });

  it("rejects non-string-array optional fields and empty packs", () => {
    expect(validatePack({ version: 1, id: "x", title: "t", cards: [] }).ok).toBe(false);
    expect(validatePack({ version: 1, id: "x", title: "t", cards: [{ id: "a", q: "q", a: "a", tags: "vocab" }] }).ok).toBe(false);
    expect(validatePack([]).ok).toBe(false);
  });

  it("reports JSON syntax errors", () => {
    const r = parsePackJson("{nope");
    expect(r.ok).toBe(false);
  });

  it("preserves unknown fields", () => {
    const r = validatePack({ version: 1, id: "x", title: "t", extra: 1, cards: [{ id: "a", q: "q", a: "a", note: "n" }] });
    expect(r.ok && (r.pack.cards[0] as unknown as Record<string, unknown>).note).toBe("n");
  });
});

describe("csv", () => {
  it("parses quotes, escaped quotes, embedded commas and newlines, CRLF", () => {
    expect(parseCsv('q,a\r\n"Hi, there","say ""yo"""\r\n"multi\nline",b\r\n')).toEqual([
      ["q", "a"], ["Hi, there", 'say "yo"'], ["multi\nline", "b"],
    ]);
  });

  it("converts with a header, tags and explicit ids", () => {
    const r = csvToPack("id,q,a,tags\nx1,2+2,4,math;easy\n", "My Pack.csv");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.id).toBe("my-pack");
      expect(r.pack.title).toBe("My Pack");
      expect(r.pack.cards[0]).toEqual({ id: "x1", q: "2+2", a: "4", tags: ["math", "easy"] });
    }
  });

  it("works headerless and derives stable ids from the question", () => {
    const r = csvToPack("Capital of France,Paris\nCapital of France,Paris again\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.cards[0]!.id).toBe(hashId("Capital of France"));
      expect(r.pack.cards[1]!.id).not.toBe(r.pack.cards[0]!.id);
    }
  });

  it("flags rows with a missing answer", () => {
    expect(csvToPack("q,a\nonly question,\n").ok).toBe(false);
  });
});

describe("shuffle", () => {
  it("is a permutation and does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seeded());
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("match", () => {
  it("normalizes case, accents, punctuation and spacing", () => {
    expect(normalize("  Café,  AU  lait! ")).toBe("cafe au lait");
  });

  it("ignores spacing around math symbols and unifies minus/dash variants", () => {
    expect(normalize("4x + 8")).toBe(normalize("4x+8"));
    expect(normalize("12 + 5")).toBe("12+5");
    expect(normalize("−3")).toBe("-3");
    expect(normalize("25 %")).toBe("25%");
    expect(normalize("6 ÷ 1/2")).toBe(normalize("6÷1/2"));
    expect(normalize("3 – 4")).toBe("3-4");
    expect(normalize("well known")).not.toBe(normalize("wellknown")); // word spacing still matters
  });

  it("grades typed math answers regardless of spacing or minus glyph", () => {
    expect(checkTyped("4x+8", card("1", "4x + 8"))).toBe("exact");
    expect(checkTyped("4x + 8", card("1", "4x+8"))).toBe("exact");
    expect(checkTyped("-3", card("1", "−3"))).toBe("exact");
    expect(checkTyped("12+5", card("1", "12 + 5"))).toBe("exact");
    expect(checkTyped("4x+9", card("1", "4x + 8"))).toBe("wrong");
  });

  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("scales typo tolerance with length", () => {
    expect([allowedEdits(3), allowedEdits(6), allowedEdits(15)]).toEqual([0, 1, 2]);
  });

  it("grades exact, close and wrong", () => {
    const c = card("1", "coefficient", { accept: ["the number multiplied by a variable"] });
    expect(checkTyped("Coefficient", c)).toBe("exact");
    expect(checkTyped("coeficient", c)).toBe("close");
    expect(checkTyped("the number multiplied by a variable", c)).toBe("exact");
    expect(checkTyped("variable", c)).toBe("wrong");
    expect(checkTyped("   ", c)).toBe("wrong");
  });

  it("requires short answers to be exact", () => {
    expect(checkTyped("8", card("1", "7"))).toBe("wrong");
    expect(checkTyped("-7", card("1", "-7"))).toBe("exact");
  });
});

describe("buildChoices", () => {
  const all = [card("1", "A1"), card("2", "A2"), card("3", "A3"), card("4", "A4"), card("5", "A5")];

  it("includes the answer plus distractors from other cards, no duplicates", () => {
    const out = buildChoices(all[0]!, all, 4, seeded());
    expect(out).toHaveLength(4);
    expect(out).toContain("A1");
    expect(new Set(out).size).toBe(4);
  });

  it("prefers authored choices", () => {
    const c = card("1", "right", { choices: ["w1", "w2", "w3"] });
    expect(buildChoices(c, [c, ...all.slice(1)], 4, seeded()).sort()).toEqual(["right", "w1", "w2", "w3"]);
  });

  it("returns fewer options when the pack is small or answers repeat", () => {
    const small = [card("1", "yes"), card("2", "yes"), card("3", "Yes!")];
    expect(buildChoices(small[0]!, small, 4, seeded())).toEqual(["yes"]);
  });
});
