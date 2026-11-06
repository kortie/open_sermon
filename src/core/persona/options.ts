// Persona allowed values (DESIGN 3.8, skill persona-builder §4.1). Stored values are
// language-independent codes; screen labels live in i18n under `persona.<field>.<code>`.
export const PERSONA_OPTIONS = {
  denomination: ['presbyterian', 'methodist', 'baptist', 'holiness_pentecostal', 'nondenominational_other'],
  emphasis: ['grace', 'covenant', 'practice', 'mission', 'holy_spirit', 'meditation', 'community'],
  style: ['expository', 'topical', 'narrative'],
  tone: ['exhortation', 'explanatory', 'concise_firm'],
  audience: ['individual', 'small_group', 'young_adult', 'adult'],
  // Fixed (DESIGN 3.8, 2026-11-05): draft body only, appended illustrations/remarks excluded.
  length: ['1000'],
} as const;

export type PersonaField = keyof typeof PERSONA_OPTIONS;
export type Denomination = (typeof PERSONA_OPTIONS.denomination)[number];
export type Emphasis = (typeof PERSONA_OPTIONS.emphasis)[number];
export type Style = (typeof PERSONA_OPTIONS.style)[number];
export type Tone = (typeof PERSONA_OPTIONS.tone)[number];
export type Audience = (typeof PERSONA_OPTIONS.audience)[number];
export type LengthCode = (typeof PERSONA_OPTIONS.length)[number];

export const SINGLE_FIELDS = ['denomination', 'style', 'tone', 'audience', 'length'] as const;
export const PERSONA_NAME_MAX = 20;

export interface Persona {
  id: string;
  /** User label to tell personas apart (≤ 20 chars). Never put into prompts. */
  name: string;
  denomination: Denomination;
  emphasis: Emphasis[];
  style: Style;
  tone: Tone;
  audience: Audience;
  length: LengthCode;
}

/** i18n key of an option label. */
export const optionLabelKey = (field: PersonaField, code: string) => `persona.${field}.${code}`;

export function defaultPersona(id: string, name: string): Persona {
  return { id, name, denomination: 'nondenominational_other', emphasis: ['grace'], style: 'expository', tone: 'explanatory', audience: 'adult', length: '1000' };
}
