// Persona validation (DESIGN 3.8, skill persona-builder §4.2–4.3). Unknown codes are errors,
// never silently dropped. Saved personas are validated again when read (old-version defence).
import { looksLikePersonLabel } from '../validate/person-name';
import { PERSONA_NAME_MAX, PERSONA_OPTIONS, SINGLE_FIELDS, type Emphasis, type Persona } from './options';

export type PersonaError =
  | 'id'
  | 'name_empty'
  | 'name_too_long'
  | 'name_person'
  | 'denomination'
  | 'emphasis'
  | 'style'
  | 'tone'
  | 'audience'
  | 'length';

export type PersonaResult = { ok: true; persona: Persona } | { ok: false; errors: PersonaError[] };

const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length;

export function validatePersona(input: unknown): PersonaResult {
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const errors: PersonaError[] = [];
  if (typeof o.id !== 'string' || o.id === '') errors.push('id');

  const name = typeof o.name === 'string' ? o.name.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (name === '') errors.push('name_empty');
  else if (graphemes(name) > PERSONA_NAME_MAX) errors.push('name_too_long');
  else if (looksLikePersonLabel(name)) errors.push('name_person');

  for (const f of SINGLE_FIELDS) {
    if (!(PERSONA_OPTIONS[f] as readonly unknown[]).includes(o[f])) errors.push(f);
  }

  const emphasis: Emphasis[] = [];
  const allowed = PERSONA_OPTIONS.emphasis as readonly unknown[];
  if (!Array.isArray(o.emphasis) || o.emphasis.length === 0 || o.emphasis.some((e) => !allowed.includes(e))) errors.push('emphasis');
  else for (const e of PERSONA_OPTIONS.emphasis) if (o.emphasis.includes(e)) emphasis.push(e); // dedupe, canonical order

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    persona: {
      id: o.id as string,
      name,
      denomination: o.denomination as Persona['denomination'],
      emphasis,
      style: o.style as Persona['style'],
      tone: o.tone as Persona['tone'],
      audience: o.audience as Persona['audience'],
      length: o.length as Persona['length'],
    },
  };
}
