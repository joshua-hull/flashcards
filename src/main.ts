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
  forgetPack, listPackIds, loadPack, loadProgress, mastery, recordSession, resetProgress, savePack, schedulesOf, weakCardIds,
} from "./lib/storage";
import type { Card, Pack } from "./lib/types";
import { downloadText, h, keys, kbd, store, view, type Child } from "./dom";
import { backupFilename, buildBackup, mergeBackup, parseBackup } from "./lib/backup";
import { dayNumber, describeDay, dueSummary, qualityFor, selectDue } from "./lib/scheduler";
import { openDesigner } from "./designer";
import { draftFromPack, isBlankDraft, loadDraft, type Draft } from "./lib/designer";

// ---------- pack designer ----------

const hasDraft = (): boolean => {
  const d = loadDraft(store);
  return !!d && !isBlankDraft(d);
};

/** Open the designer on a saved pack, or resume/start a draft when no pack is given. */
function design(pack?: Pack) {
  let draft: Draft | undefined;
  if (pack) {
    if (hasDraft() && !confirm("You have an unsaved draft. Replace it with this pack?")) return;
    draft = draftFromPack(pack);
  } else {
    draft = loadDraft(store);
  }
  const back = pack
    ? () => { const saved = loadPack(store, pack.id); if (saved) packView(saved); else home(); }
    : home;
  openDesigner({ draft, originalId: pack?.id, back, study: packView });
}

// ---------- home ----------

let loadErrors: string[] = [];
let backupMessage: { ok: boolean; lines: string[] } | null = null;

/** Cards due for review today (excluding brand-new ones), for the pack list. */
function dueNow(p: Pack): number {
  const today = dayNumber(new Date());
  return dueSummary(p.cards, schedulesOf(loadProgress(store, p.id), today), today).dueCount;
}

function exportBackup() {
  const backup = buildBackup(store);
  downloadText(backupFilename(), JSON.stringify(backup, null, 2) + "\n");
  backupMessage = { ok: true, lines: [`Exported ${backup.packs.length} pack${backup.packs.length === 1 ? "" : "s"} with their progress.`] };
  home();
}

async function importBackup(file: File | undefined) {
  if (!file) return;
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) backupMessage = { ok: false, lines: [`Couldn't import ${file.name}:`, ...parsed.errors] };
  else {
    const r = mergeBackup(store, parsed.backup);
    backupMessage = { ok: true, lines: [
      `Imported ${file.name}: ${r.packsAdded} new pack${r.packsAdded === 1 ? "" : "s"}${r.packsKept ? ` (${r.packsKept} already here, kept as they are)` : ""}.`,
      `Progress: ${r.cardsImported} card${r.cardsImported === 1 ? "" : "s"} updated${r.cardsKept ? `, ${r.cardsKept} kept because your version was newer` : ""}.`,
    ] };
  }
  home();
}


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

function backupPanel(): HTMLElement {
  const input = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: () => void importBackup(input.files?.[0]) });
  const hasPacks = listPackIds(store).length > 0;
  const msg = backupMessage;
  backupMessage = null;
  return h("section", { class: "panel stack" },
    h("h2", {}, "Backup"),
    h("p", { class: "muted" }, "Your packs and progress live only in this browser. Export a backup file to keep them safe or move them to another device; importing merges, keeping the newest answer for each card."),
    h("div", { class: "row" },
      h("button", { disabled: !hasPacks, onclick: exportBackup }, "Export backup"),
      h("label", { class: "btn" }, "Import backup…", input)),
    msg && h("div", { class: msg.ok ? "verdict good" : "errors-box", role: msg.ok ? "status" : "alert" },
      ...msg.lines.map((l, i) => h("div", { class: i === 0 && !msg.ok ? "verdict bad" : "" }, l))));
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
        h("div", { class: "muted" }, `${p.cards.length} cards · ${m.mastered} mastered${dueNow(p) ? ` · ${dueNow(p)} due` : ""}`)),
      h("button", { onclick: () => packView(p) }, "Open"),
      h("button", { class: "link", onclick: () => design(p) }, "Edit"),
      h("button", { class: "link danger", onclick: () => { if (confirm(`Remove "${p.title}" and its progress from this browser?`)) { forgetPack(store, p.id); home(); } } }, "Remove"));
  }));

  view(
    h("header", { class: "stack" }, h("h1", {}, "Flashcards"),
      h("p", { class: "muted" }, "Load a pack of questions and answers and get quizzed. Everything stays in your browser.")),
    drop,
    loadErrors.length && h("div", { class: "panel errors", role: "alert" },
      h("div", {}, loadErrors[0]!), h("ul", {}, ...loadErrors.slice(1).map((e) => h("li", {}, e)))),
    list,
    backupPanel(),
    h("p", { class: "muted" }, "No pack handy? ",
      h("button", { class: "link", onclick: () => openPack(parsePackJson(sampleText), "sample") }, "Try the sample pack"),
      " or ",
      h("button", { class: "link", onclick: () => design() }, hasDraft() ? "continue your draft" : "create your own")),
  );
}

// ---------- pack overview / setup ----------

const MODES: { mode: Mode; name: string; blurb: string }[] = [
  { mode: "flip", name: "Flip", blurb: "See the question, reveal the answer, grade yourself." },
  { mode: "choice", name: "Multiple choice", blurb: "Pick the right answer from options." },
  { mode: "typed", name: "Type the answer", blurb: "Small typos are forgiven." },
];
let lastMode: Mode = "flip";

type Source = "due" | "all" | "weak";

function packView(pack: Pack) {
  const progress = loadProgress(store, pack.id);
  const m = mastery(progress, pack);
  const weak = weakCardIds(progress, pack);
  const today = dayNumber(new Date());
  const schedules = schedulesOf(progress, today);
  const due = dueSummary(pack.cards, schedules, today);
  const dueCards = selectDue(pack.cards, schedules, today);
  let mode = lastMode;
  let source: Source = dueCards.length ? "due" : "all";

  const radios = MODES.map((o) => {
    const r = h("input", { type: "radio", name: "mode", value: o.mode, checked: o.mode === mode, onchange: () => { mode = o.mode; lastMode = mode; } });
    return h("label", {}, r, h("span", {}, h("strong", {}, o.name), h("div", { class: "muted" }, o.blurb)));
  });

  const newInSession = dueCards.length - due.dueCount;
  const sources: { value: Source; name: string; blurb: string; show: boolean }[] = [
    { value: "due", show: dueCards.length > 0, name: `Due today (${dueCards.length})`,
      blurb: `${due.dueCount} due for review${newInSession ? `, ${newInSession} new` : ""}. Spaced repetition schedules the next review from how you answer.` },
    { value: "all", show: true, name: `All cards (${pack.cards.length})`, blurb: "Practice everything. Cards that aren't due yet keep their schedule if you answer them correctly." },
    { value: "weak", show: weak.length > 0, name: `Last missed (${weak.length})`, blurb: "Only the cards you got wrong most recently." },
  ];
  const sourceRadios = sources.filter((o) => o.show).map((o) =>
    h("label", {}, h("input", { type: "radio", name: "source", value: o.value, checked: o.value === source, onchange: () => { source = o.value; } }),
      h("span", {}, h("strong", {}, o.name), h("div", { class: "muted" }, o.blurb))));

  const nothingDue = !dueCards.length && due.nextDue !== undefined ? `Nothing due today. Next review ${describeDay(due.nextDue, today)}.` : null;

  view(
    h("header", { class: "stack" },
      h("div", { class: "spread" },
        h("button", { class: "link", onclick: home }, "← All packs"),
        h("button", { class: "link", onclick: () => design(pack) }, "Edit pack")),
      h("h1", {}, pack.title),
      pack.description && h("p", { class: "muted" }, pack.description),
      h("p", { class: "muted" }, `${pack.cards.length} cards · ${m.studied} studied · ${m.mastered} mastered · ${progress.sessions} sessions`),
      nothingDue && h("p", { class: "verdict good" }, nothingDue)),
    h("section", { class: "panel modes" }, h("h2", {}, "Study"), ...sourceRadios),
    h("section", { class: "panel modes" }, h("h2", {}, "Mode"), ...radios),
    h("button", { class: "primary", onclick: () => {
      const cards = source === "due" ? dueCards : source === "weak" ? pack.cards.filter((c) => weak.includes(c.id)) : pack.cards;
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
  const next = (correct: boolean, verdict?: Verdict) => quiz(pack, record(session, correct, qualityFor(mode, correct, verdict)));
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
  keys.onKey = (e) => {
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
  keys.onKey = (e) => {
    const n = Number(e.key);
    if (picked === null && n >= 1 && n <= options.length) pick(n - 1);
    else if (picked !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(options[picked] === card.a); }
  };
}

function typedView(top: Node, bar: Node, card: Card, front: () => HTMLElement, next: (ok: boolean, verdict?: Verdict) => void) {
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
    feedback.hidden = false;
    feedback.replaceChildren(
      h("div", { class: `verdict ${good ? "good" : "bad"}` }, label),
      h("div", { class: "panel" }, h("div", { class: "muted" }, "Answer"), card.a),
      h("div", { class: "row" },
        !good && h("button", { onclick: () => next(true, "close") }, "I was right"), // self-override counts as weak recall
        h("button", { class: "primary", onclick: () => next(good, verdict as Verdict) }, "Next ", kbd("enter"))));
    submit.hidden = true;
    (feedback.querySelector("button.primary") as HTMLElement).focus();
  }

  view(top, bar, front(), input, submit, feedback);
  input.focus();
  keys.onKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!verdict) check();
    else next(verdict !== "wrong", verdict);
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

home();
