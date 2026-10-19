export interface Card {
  id: string;
  q: string;
  a: string;
  choices?: string[];
  accept?: string[];
  tags?: string[];
}

export interface Pack {
  version: 1;
  id: string;
  title: string;
  description?: string;
  cards: Card[];
}

export type Rng = () => number;
