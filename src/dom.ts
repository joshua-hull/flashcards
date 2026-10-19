import type { KeyValueStore } from "./lib/storage";

const app = document.getElementById("app")!;

/** localStorage can throw or be absent (private mode, blocked site data); fall back to memory. */
export const store: KeyValueStore = (() => {
  try {
    localStorage.setItem("flashcards:probe", "1");
    localStorage.removeItem("flashcards:probe");
    return localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
})();

export type Child = Node | string | null | undefined | false | 0 | "";

/** Tiny element builder. `on*` props become listeners, `true` becomes a bare attribute, null/false are skipped. */
export function h<K extends keyof HTMLElementTagNameMap>(
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

export const kbd = (s: string) => h("kbd", {}, s);

/** Hand the user a text file via a temporary download link. */
export function downloadText(filename: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Replace an element's children, skipping falsy entries like `h` does. */
export const fill = (el: HTMLElement, ...kids: Child[]): void =>
  el.replaceChildren(...kids.filter((k): k is Node | string => !!k));

/** The current screen's keyboard handler; `view` clears it so handlers never leak between screens. */
export const keys: { onKey: ((e: KeyboardEvent) => void) | null } = { onKey: null };

export function view(...nodes: Child[]) {
  keys.onKey = null;
  fill(app, ...nodes);
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  keys.onKey?.(e);
});
