import type { Card, Rng } from "./types";
import { shuffle } from "./shuffle";
import { normalize } from "./match";

/**
 * Build shuffled multiple-choice options: the answer plus up to `count - 1` distractors.
 * Authored `choices` win; remaining slots are filled from other cards' answers.
 * Returns fewer options when the pack lacks enough distinct answers.
 */
export function buildChoices(card: Card, all: readonly Card[], count = 4, rng?: Rng): string[] {
  const taken = new Set([normalize(card.a)]);
  const picked: string[] = [];
  const add = (s: string) => {
    const key = normalize(s);
    if (picked.length < count - 1 && key && !taken.has(key)) { taken.add(key); picked.push(s); }
  };

  (card.choices ?? []).forEach(add);
  shuffle(all.filter((c) => c.id !== card.id), rng).forEach((c) => add(c.a));

  return shuffle([card.a, ...picked], rng);
}
