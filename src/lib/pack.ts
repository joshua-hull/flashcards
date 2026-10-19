import type { Card, Pack } from "./types";

export type ParseResult = { ok: true; pack: Pack } | { ok: false; errors: string[] };

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

/** Validate parsed JSON against the v1 pack schema, collecting every problem found. */
export function validatePack(data: unknown): ParseResult {
  const errors: string[] = [];
  if (!isObject(data)) return { ok: false, errors: ["Pack must be a JSON object."] };

  if (data.version !== 1) errors.push(`Unsupported pack version: ${JSON.stringify(data.version)} (expected 1).`);
  if (typeof data.id !== "string" || !ID_PATTERN.test(data.id))
    errors.push('Pack "id" must be lowercase letters, digits and hyphens (e.g. "math-7-vocab").');
  if (typeof data.title !== "string" || !data.title.trim()) errors.push('Pack "title" is required.');
  if (data.description !== undefined && typeof data.description !== "string")
    errors.push('Pack "description" must be a string.');

  if (!Array.isArray(data.cards) || data.cards.length === 0) {
    errors.push('Pack needs a non-empty "cards" array.');
  } else {
    const seen = new Set<string>();
    data.cards.forEach((raw, i) => {
      const at = `Card #${i + 1}`;
      if (!isObject(raw)) return errors.push(`${at} must be an object.`);
      for (const key of ["id", "q", "a"] as const) {
        const v = raw[key];
        if (typeof v !== "string" || !v.trim()) errors.push(`${at} is missing "${key}".`);
      }
      if (typeof raw.id === "string" && raw.id.trim()) {
        if (seen.has(raw.id)) errors.push(`${at}: duplicate card id "${raw.id}".`);
        seen.add(raw.id);
      }
      for (const key of ["choices", "accept", "tags"] as const) {
        if (raw[key] !== undefined && !isStringArray(raw[key])) errors.push(`${at}: "${key}" must be an array of strings.`);
      }
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, pack: data as unknown as Pack };
}

/** Parse pack JSON text, reporting syntax errors the same way as validation errors. */
export function parsePackJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  return validatePack(data);
}

export type { Card, Pack };
