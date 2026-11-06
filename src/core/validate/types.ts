// Generation output (DESIGN 6.2) and validation issues (DESIGN 7.1–7.3, skill generation-validator §4.1).

export interface GenerationOutput {
  sermon: { title: string; body: string; verse_refs: string[] };
  examples: { text: string; verse_refs: string[] }[];
  humor: { text: string; purpose: string }[];
}

export type Lang = 'ko' | 'en';

export type Issue =
  | { kind: 'schema' }
  | { kind: 'count'; field: 'examples' | 'humor' }
  | { kind: 'length'; actual: number; min: number; max: number; unit: 'chars' | 'words' }
  | { kind: 'verse_out_of_range'; ref: string }
  | { kind: 'verse_missing'; index: number }
  | { kind: 'real_person' }
  | { kind: 'forbidden_expr'; term: string }
  | { kind: 'copy'; sourceId: string }
  | { kind: 'humor_topic'; index: number; topic: string }
  | { kind: 'humor_purpose'; index: number };

export type IssueKind = Issue['kind'];
