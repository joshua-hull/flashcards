import type { Card, Rng } from "./types";
import type { Quality } from "./scheduler";
import { shuffle } from "./shuffle";

export type Mode = "flip" | "choice" | "typed";

export interface Answer {
  cardId: string;
  correct: boolean;
  quality?: Quality; // SM-2 quality for the scheduler; storage derives one from `correct` when absent
}

export interface Session {
  mode: Mode;
  deck: Card[];
  index: number;
  answers: Answer[];
}

export interface Summary {
  total: number;
  right: number;
  missed: Card[];
}

export function startSession(cards: readonly Card[], mode: Mode, rng?: Rng): Session {
  return { mode, deck: shuffle(cards, rng), index: 0, answers: [] };
}

export const isDone = (s: Session): boolean => s.index >= s.deck.length;

export const currentCard = (s: Session): Card | undefined => s.deck[s.index];

/** Record the result for the current card and advance. Returns the same session once finished. */
export function record(s: Session, correct: boolean, quality?: Quality): Session {
  const card = currentCard(s);
  if (!card) return s;
  return { ...s, index: s.index + 1, answers: [...s.answers, { cardId: card.id, correct, ...(quality !== undefined ? { quality } : {}) }] };
}

export function summarize(s: Session): Summary {
  const wrong = new Set(s.answers.filter((a) => !a.correct).map((a) => a.cardId));
  return {
    total: s.answers.length,
    right: s.answers.length - wrong.size,
    missed: s.deck.filter((c) => wrong.has(c.id)),
  };
}
