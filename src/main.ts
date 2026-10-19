import "./style.css";
import sampleText from "../packs/sample.json?raw";
import { buildChoices } from "./lib/choices";
import { csvToPack } from "./lib/csv";
import { checkTyped, type Verdict } from "./lib/match";
import { parsePackJson, type ParseResult } from "./lib/pack";
import {
  currentCard, isDone, record, startSession, summarize, type Mode, type Session,
} from "./lib/session";
import {
  forgetPack, listPackIds, loadPack, loadProgress, mastery, recordSession, resetProgress, savePack, weakCardIds,
  type KeyValueStore,
} from "./lib/storage";
import type { Card, Pack } from "./lib/types";

const app = document.getElementById("app")!;

/** localStorage can throw or be absent (private mode, blocked site data); fall back to memory. */
const store: KeyValueStore = (() => {
  try {
    localStorage.setItem("flashcards:probe", "1");
    localStorage.removeItem("flashcards:probe");
    return localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
})();

type Child = Node | string | null | undefined | false | 0 | "";
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = String(v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}
const kbd = (s: string) => h("kbd", {}, s);

let onKey: ((e: KeyboardEvent) => void) | null = null;
function view(...nodes: Child[]) {
  onKey = null;
  app.replaceChildren(...nodes.filter((n): n is Node | string => !!n));
}

// ---------- home ----------

let loadErrors: string[] = [];

function openPack(result: ParseResult, source: string) {
  if (!result.ok) {
    loadErrors = [`${source}:`, ...result.errors];
    return home();
  }
  loadErrors = [];
  if (!savePack(store, result.pack)) loadErrors = ["Loaded, but this browser wouldn't save the pack, so it won't be here next visit."];
  packView(result.pack);
}

async function loadFile(file: File | undefined) {
  if (!file) return;
  const text = await file.text();
  const isCsv = /\.(csv|tsv)$/i.test(file.name) || file.type === "text/csv";
  openPack(isCsv ? csvToPack(text, file.name) : parsePackJson(text), file.name);
}

function home() {
  const input = h("input", { type: "file", accept: ".json,.csv,application/json,text/csv", hidden: true, onchange: () => void loadFile(input.files?.[0]) });
  const drop = h("label", { class: "panel drop" },
    h("div", {}, "Drop a pack (.json or .csv) here, or tap to choose one"), input);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); void loadFile(e.dataTransfer?.files[0]); });

  const saved = listPackIds(store).map((id) => loadPack(store, id)).filter((p): p is Pack => !!p);
  const list = saved.length && h("section", { class: "panel" }, h("h2", {}, "Your packs"), ...saved.map((p) => {
    const m = mastery(loadProgress(store, p.id), p);
    return h("div", { class: "pack-item" },
      h("div", { class: "grow" }, h("div", { class: "name" }, p.title),
        h("div", { class: "muted" }, `${p.cards.length} cards · ${m.mastered} mastered`)),
      h("button", { onclick: () => packView(p) }, "Open"),
      h("button", { class: "link danger", onclick: () => { if (confirm(`Remove "${p.title}" and its progress from this browser?`)) { forgetPack(store, p.id); home(); } } }, "Remove"));
  }));

  view(
    h("header", { class: "stack" }, h("h1", {}, "Flashcards"),
      h("p", { class: "muted" }, "Load a pack of questions and answers and get quizzed. Everything stays in your browser.")),
    drop,
    loadErrors.length && h("div", { class: "panel errors", role: "alert" },
      h("div", {}, loadErrors[0]!), h("ul", {}, ...loadErrors.slice(1).map((e) => h("li", {}, e)))),
    list,
    h("p", { class: "muted" }, "No pack handy? ",
      h("button", { class: "link", onclick: () => openPack(parsePackJson(sampleText), "sample") }, "Try the sample pack")),
  );
}

// ---------- pack overview / setup ----------

const MODES: { mode: Mode; name: string; blurb: string }[] = [
  { mode: "flip", name: "Flip", blurb: "See the question, reveal the answer, grade yourself." },
  { mode: "choice", name: "Multiple choice", blurb: "Pick the right answer from options." },
  { mode: "typed", name: "Type the answer", blurb: "Small typos are forgiven." },
];
let lastMode: Mode = "flip";

function packView(pack: Pack) {
  const progress = loadProgress(store, pack.id);
  const m = mastery(progress, pack);
  const weak = weakCardIds(progress, pack);
  let mode = lastMode;

  const radios = MODES.map((o) => {
    const r = h("input", { type: "radio", name: "mode", value: o.mode, checked: o.mode === mode, onchange: () => { mode = o.mode; lastMode = mode; } });
    return h("label", {}, r, h("span", {}, h("strong", {}, o.name), h("div", { class: "muted" }, o.blurb)));
  });
  const onlyWeak = h("input", { type: "checkbox", id: "weak" });

  view(
    h("header", { class: "stack" },
      h("button", { class: "link", onclick: home }, "← All packs"),
      h("h1", {}, pack.title),
      pack.description && h("p", { class: "muted" }, pack.description),
      h("p", { class: "muted" }, `${pack.cards.length} cards · ${m.studied} studied · ${m.mastered} mastered · ${progress.sessions} sessions`)),
    h("section", { class: "panel modes" }, h("h2", {}, "Mode"), ...radios),
    weak.length ? h("label", { class: "row", for: "weak" }, h("span", {}, onlyWeak, ` Only the ${weak.length} card${weak.length === 1 ? "" : "s"} I last missed`)) : null,
    h("button", { class: "primary", onclick: () => {
      const cards = onlyWeak.checked ? pack.cards.filter((c) => weak.includes(c.id)) : pack.cards;
      quiz(pack, startSession(cards, mode));
    } }, "Start"),
    h("button", { class: "link danger", disabled: !progress.sessions, onclick: () => { if (confirm("Reset progress for this pack?")) { resetProgress(store, pack.id); packView(pack); } } }, "Reset progress"),
  );
}

// ---------- quiz ----------

function quiz(pack: Pack, session: Session) {
  if (isDone(session)) return finish(pack, session);
  const card = currentCard(session)!;
  const useChoices = session.mode === "choice" ? buildChoices(card, pack.cards) : [];
  const mode: Mode = session.mode === "choice" && useChoices.length < 2 ? "flip" : session.mode; // too few options: degrade per card

  const bar = h("div", { class: "bar" }, h("div", { style: `width:${(session.index / session.deck.length) * 100}%` }));
  const top = h("div", { class: "spread" },
    h("span", { class: "muted" }, `Question ${session.index + 1} / ${session.deck.length}`),
    h("button", { class: "link", onclick: () => { if (confirm("Quit this session? Progress for it won't be saved.")) packView(pack); } }, "Quit"));
  const next = (correct: boolean) => quiz(pack, record(session, correct));
  const front = (extra: Child = null) => h("div", { class: `card${mode === "flip" ? " flip" : ""}`, tabindex: mode === "flip" ? 0 : null }, card.q, extra);

  if (mode === "flip") flipView(top, bar, card, next);
  else if (mode === "choice") choiceView(top, bar, card, useChoices, next);
  else typedView(top, bar, card, front, next);
}

function flipView(top: Node, bar: Node, card: Card, next: (ok: boolean) => void) {
  let shown = false;
  const face = h("div", { class: "card flip", tabindex: 0 }, h("div", { class: "side" }, "Question"), card.q);
  const actions = h("div", { class: "row" });
  const reveal = () => {
    if (shown) return;
    shown = true;
    face.replaceChildren(h("div", { class: "side" }, "Answer"), card.a);
    actions.replaceChildren(
      h("button", { class: "bad", onclick: () => next(false) }, "Missed ", kbd("1")),
      h("button", { class: "ok", onclick: () => next(true) }, "Got it ", kbd("2")));
  };
  actions.append(h("button", { class: "primary", onclick: reveal }, "Show answer ", kbd("space")));
  face.addEventListener("click", reveal);
  view(top, bar, face, actions);
  onKey = (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!shown) reveal(); }
    else if (shown && (e.key === "1" || e.key === "ArrowLeft")) next(false);
    else if (shown && (e.key === "2" || e.key === "ArrowRight")) next(true);
  };
}

function choiceView(top: Node, bar: Node, card: Card, options: string[], next: (ok: boolean) => void) {
  let picked: number | null = null;
  const nextBtn = h("button", { class: "primary", hidden: true, onclick: () => next(options[picked!] === card.a) }, "Next ", kbd("enter"));
  const buttons = options.map((opt, i) => h("button", { onclick: () => pick(i) }, kbd(String(i + 1)), h("span", {}, opt)));
  function pick(i: number) {
    if (picked !== null) return;
    picked = i;
    buttons.forEach((b, j) => {
      b.disabled = true;
      if (options[j] === card.a) b.classList.add("right");
      else if (j === i) b.classList.add("wrong");
    });
    nextBtn.hidden = false;
    nextBtn.focus();
  }
  view(top, bar, h("div", { class: "card" }, h("div", { class: "side" }, "Question"), card.q), h("div", { class: "options" }, ...buttons), nextBtn);
  onKey = (e) => {
    const n = Number(e.key);
    if (picked === null && n >= 1 && n <= options.length) pick(n - 1);
    else if (picked !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(options[picked] === card.a); }
  };
}

function typedView(top: Node, bar: Node, card: Card, front: () => HTMLElement, next: (ok: boolean) => void) {
  let verdict: Verdict | null = null;
  const input = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: false, "aria-label": "Your answer", placeholder: "Type your answer" });
  const feedback = h("div", { class: "stack", hidden: true });
  const submit = h("button", { class: "primary", onclick: check }, "Check ", kbd("enter"));

  function check() {
    if (verdict) return;
    verdict = checkTyped(input.value, card);
    input.disabled = true;
    const good = verdict !== "wrong";
    const label = verdict === "exact" ? "Correct" : verdict === "close" ? "Close enough — counted as correct" : "Not quite";
    const go = (ok: boolean) => () => next(ok);
    feedback.hidden = false;
    feedback.replaceChildren(
      h("div", { class: `verdict ${good ? "good" : "bad"}` }, label),
      h("div", { class: "panel" }, h("div", { class: "muted" }, "Answer"), card.a),
      h("div", { class: "row" },
        !good && h("button", { onclick: go(true) }, "I was right"),
        h("button", { class: "primary", onclick: go(good) }, "Next ", kbd("enter"))));
    submit.hidden = true;
    (feedback.querySelector("button.primary") as HTMLElement).focus();
  }

  view(top, bar, front(), input, submit, feedback);
  input.focus();
  onKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!verdict) check();
    else next(verdict !== "wrong");
  };
}

// ---------- summary ----------

function finish(pack: Pack, session: Session) {
  recordSession(store, pack.id, session.answers);
  const s = summarize(session);
  const pct = s.total ? Math.round((s.right / s.total) * 100) : 0;
  view(
    h("header", {}, h("h1", {}, pack.title)),
    h("div", { class: "card", style: "cursor:default" },
      h("div", { class: "score" }, `${s.right} / ${s.total}`),
      h("div", { class: "muted" }, `${pct}% correct`),
      s.missed.length ? h("div", { class: "stack" }, h("h2", {}, "Missed"),
        h("ul", { class: "missed" }, ...s.missed.map((c) => h("li", {}, `${c.q} → ${c.a}`)))) : h("p", {}, "Perfect round!")),
    h("div", { class: "row" },
      s.missed.length ? h("button", { class: "primary", onclick: () => quiz(pack, startSession(s.missed, session.mode)) }, `Retry ${s.missed.length} missed`) : null,
      h("button", { onclick: () => quiz(pack, startSession(session.deck, session.mode)) }, "Again, all cards"),
      h("button", { onclick: () => packView(pack) }, "Back to pack")),
  );
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  onKey?.(e);
});

home();
