import { downloadText, fill, h, store, view } from "./dom";
import { buildChoices } from "./lib/choices";
import { csvToPack } from "./lib/csv";
import {
  blankCard, blankDraft, checkDraft, clearDraft, downloadName, draftFromPack, draftToPack, isBlankDraft,
  moveCard, removeCard, saveDraft, slugifyTitle, toJson, type Draft, type DraftCard,
} from "./lib/designer";
import { parsePackJson, type ParseResult } from "./lib/pack";
import { savePack } from "./lib/storage";
import type { Pack, Rng } from "./lib/types";

export interface DesignerOptions {
  draft?: Draft; // resume or start from this draft; defaults to a blank one
  originalId?: string; // id of the saved pack being edited, to warn when it changes
  back: () => void;
  study: (pack: Pack) => void;
}

/** Deterministic per-card RNG so the multiple-choice preview doesn't reshuffle on every keystroke. */
function seeded(seed: string): Rng {
  let a = 0;
  for (const c of seed) a = (Math.imul(a, 31) + c.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textInput(value: string, onInput: (v: string) => void, attrs: Record<string, unknown> = {}) {
  const el = h("input", { type: "text", autocomplete: "off", ...attrs });
  el.value = value;
  el.addEventListener("input", () => onInput(el.value));
  return el;
}

function textArea(value: string, onInput: (v: string) => void, rows = 2, attrs: Record<string, unknown> = {}) {
  const el = h("textarea", { rows, ...attrs });
  el.value = value;
  el.addEventListener("input", () => onInput(el.value));
  return el;
}

const field = (label: string, control: HTMLElement, hint?: string) =>
  h("label", { class: "field" }, h("span", { class: "label" }, label), control, hint && h("span", { class: "muted" }, hint));

export function openDesigner(opts: DesignerOptions) {
  const draft: Draft = opts.draft ?? blankDraft();
  let focused: DraftCard = draft.cards[0]!;
  let lastSavedJson: string | null = opts.originalId ? toJson(draftToPack(draft)) : null; // editing a saved pack: untouched means nothing to resume
  let notice = "";

  const status = h("section", { class: "panel stack" });
  const preview = h("section", { class: "panel stack" });
  const cardsEl = h("div", { class: "stack" });
  const idInput = textInput(draft.id, (v) => { draft.id = v; draft.idTouched = true; refresh(); }, { "aria-describedby": "id-hint" });

  // ---------- derived panels ----------

  function renderStatus() {
    const check = checkDraft(draft);
    const idChanged = !!opts.originalId && draft.id.trim() !== opts.originalId;
    fill(status,
      h("h2", {}, "Check & export"),
      check.pack
        ? h("div", { class: "verdict good" }, `✓ Valid — ${check.pack.cards.length} card${check.pack.cards.length === 1 ? "" : "s"}`)
        : h("div", { class: "errors-box" }, h("div", { class: "verdict bad" }, `${check.errors.length} problem${check.errors.length === 1 ? "" : "s"} to fix`),
            h("ul", {}, ...check.errors.map((e) => h("li", {}, e)))),
      check.warnings.length ? h("div", {}, h("div", { class: "muted" }, "Worth a look:"), h("ul", {}, ...check.warnings.map((w) => h("li", {}, w)))) : null,
      idChanged && h("p", { class: "muted" }, `You changed the id from "${opts.originalId}". Saving creates a separate pack; progress stays with the original.`),
      h("div", { class: "row" },
        h("button", { class: "primary", disabled: !check.pack, onclick: () => check.pack && download(check.pack) }, "Download .json"),
        h("button", { disabled: !check.pack, onclick: () => check.pack && save(check.pack, false) }, "Save to my packs"),
        h("button", { disabled: !check.pack, onclick: () => check.pack && save(check.pack, true) }, "Save & study")),
      notice && h("p", { class: "verdict good", role: "status" }, notice),
    );
  }

  function renderPreview() {
    const card = draftToPack({ ...draft, cards: [focused] }).cards[0]!;
    const all = draftToPack(draft).cards;
    const options = buildChoices(card, all.length ? all : [card], 4, seeded(card.id));
    fill(preview,
      h("h2", {}, `Preview — card #${draft.cards.indexOf(focused) + 1}`),
      h("div", { class: "card small" }, h("div", { class: "side" }, "Question"), card.q || h("span", { class: "muted" }, "(empty)")),
      h("div", { class: "card small" }, h("div", { class: "side" }, "Answer"), card.a || h("span", { class: "muted" }, "(empty)")),
      h("div", {}, h("div", { class: "muted" }, "Multiple choice would offer"),
        h("ul", {}, ...options.map((o) => h("li", {}, o)))),
      card.accept?.length ? h("div", {}, h("div", { class: "muted" }, "Typed mode also accepts"), h("ul", {}, ...card.accept.map((o) => h("li", {}, o)))) : null,
    );
  }

  function refresh() {
    notice = "";
    saveDraft(store, draft);
    renderStatus();
    renderPreview();
  }

  // ---------- actions ----------

  const download = (pack: Pack) => downloadText(downloadName(pack), toJson(pack));

  function save(pack: Pack, thenStudy: boolean) {
    if (!savePack(store, pack)) {
      notice = "";
      renderStatus();
      status.append(h("p", { class: "verdict bad", role: "alert" }, "This browser wouldn't save the pack. Use Download instead."));
      return;
    }
    lastSavedJson = toJson(pack);
    clearDraft(store);
    if (thenStudy) return opts.study(pack);
    notice = "Saved to your packs. Progress on existing cards is kept.";
    renderStatus();
  }

  function leave() {
    const current = toJson(draftToPack(draft));
    if (current === lastSavedJson || isBlankDraft(draft)) clearDraft(store); // nothing unsaved worth resuming
    opts.back();
  }

  function importFile(file: File | undefined) {
    if (!file) return;
    void file.text().then((text) => {
      const isCsv = /\.(csv|tsv)$/i.test(file.name) || file.type === "text/csv";
      const result: ParseResult = isCsv ? csvToPack(text, file.name) : parsePackJson(text);
      if (!result.ok) return alert(`Couldn't import ${file.name}:\n\n${result.errors.join("\n")}`);
      if (!isBlankDraft(draft) && !confirm("Replace what you're editing with the imported pack?")) return;
      openDesigner({ ...opts, draft: draftFromPack(result.pack), originalId: undefined });
    });
  }

  // ---------- cards ----------

  function renderCards() {
    cardsEl.replaceChildren(...draft.cards.map((c, i) => cardEditor(c, i)));
  }

  function cardEditor(c: DraftCard, i: number) {
    const move = (to: number) => () => { draft.cards = moveCard(draft.cards, i, to); renderCards(); refresh(); };
    const summary = h("summary", {}, h("span", { class: "label" }, `#${i + 1}`), " ", h("span", { class: "q-preview" }, c.q || "(new card)"));
    const q = textArea(c.q, (v) => { c.q = v; summary.querySelector(".q-preview")!.textContent = v || "(new card)"; refresh(); }, 2, { "aria-label": `Card ${i + 1} question` });
    const details = h("details", { class: "panel card-editor", open: c.q === "" && c.a === "" || draft.cards.length <= 3 },
      summary,
      h("div", { class: "stack" },
        field("Question", q),
        field("Answer", textArea(c.a, (v) => { c.a = v; refresh(); })),
        field("Wrong choices (optional)", textArea(c.choices, (v) => { c.choices = v; refresh(); }, 3), "One per line. Used for multiple choice; the answer is added automatically."),
        field("Also accept (optional)", textArea(c.accept, (v) => { c.accept = v; refresh(); }, 2), "One per line. Alternate correct answers in typed mode."),
        field("Tags (optional)", textInput(c.tags, (v) => { c.tags = v; refresh(); }), "Comma separated."),
        h("div", { class: "row" },
          h("button", { disabled: i === 0, onclick: move(i - 1), "aria-label": `Move card ${i + 1} up` }, "↑ Up"),
          h("button", { disabled: i === draft.cards.length - 1, onclick: move(i + 1), "aria-label": `Move card ${i + 1} down` }, "↓ Down"),
          h("button", { class: "bad", onclick: () => {
            if (!c.q && !c.a || confirm(`Delete card #${i + 1}?`)) {
              draft.cards = removeCard(draft.cards, i);
              if (!draft.cards.length) draft.cards.push(blankCard([]));
              if (focused === c) focused = draft.cards[Math.min(i, draft.cards.length - 1)]!;
              renderCards();
              refresh();
            }
          } }, "Delete")),
        h("div", { class: "muted" }, `id: ${c.id} (never changes)`)));
    details.addEventListener("focusin", () => { if (focused !== c) { focused = c; renderPreview(); } });
    return details;
  }

  // ---------- page ----------

  const titleInput = textInput(draft.title, (v) => {
    draft.title = v;
    if (!draft.idTouched) { draft.id = slugifyTitle(v); idInput.value = draft.id; }
    refresh();
  }, { "aria-label": "Pack title", placeholder: "e.g. 7th Grade Math Vocabulary" });
  const importInput = h("input", { type: "file", accept: ".json,.csv,application/json,text/csv", hidden: true, onchange: () => importFile(importInput.files?.[0]) });

  view(
    h("header", { class: "stack" },
      h("div", { class: "spread" },
        h("button", { class: "link", onclick: leave }, "← Back"),
        h("label", { class: "link btn-link" }, "Import a pack to edit…", importInput)),
      h("h1", {}, opts.originalId ? "Edit pack" : "Pack designer"),
      h("p", { class: "muted" }, "Your work is saved in this browser as you type. Download a .json file to share it, or save it to your packs to study.")),
    h("section", { class: "panel stack" },
      h("h2", {}, "Pack"),
      field("Title", titleInput),
      field("Id", idInput, "Lowercase letters, digits and hyphens. Progress is tracked by this id, so don't change it for a pack you've already studied."),
      field("Description (optional)", textArea(draft.description, (v) => { draft.description = v; refresh(); }, 2))),
    h("section", { class: "stack" },
      h("h2", {}, "Cards"),
      cardsEl,
      h("button", { onclick: () => {
        const c = blankCard(draft.cards);
        draft.cards.push(c);
        focused = c;
        renderCards();
        refresh();
        (cardsEl.lastElementChild?.querySelector("textarea") as HTMLElement | null)?.focus();
      } }, "+ Add card")),
    preview,
    status,
  );
  renderCards();
  renderStatus();
  renderPreview();
}
