// Light remark checks (DESIGN 7.2, open question 18 resolved 2026-11-05). A remark passes when
//  - its purpose is not empty,
//  - its purpose contains at least one input keyword,
//  - neither the remark nor its purpose hits a forbidden-topic keyword (config, per language),
//  - it does not imitate a real person.
// Any failure drops the light remark section only; it is never a retry reason.
import { generation } from '../../../config/app.config.json';
import { findTerm } from './forbidden';
import { hasImitationPattern } from './person-name';
import type { GenerationOutput, Issue } from './types';

type Topics = Record<string, readonly string[]>;
const TOPICS: Record<'ko' | 'en', Topics> = generation.humor_forbidden_topics;

/** The forbidden topic a text touches (both language lists apply), or null. */
export function forbiddenTopic(text: string, topics: Record<string, Topics> = TOPICS): string | null {
  for (const byTopic of Object.values(topics))
    for (const [topic, terms] of Object.entries(byTopic)) if (findTerm(text, terms)) return topic;
  return null;
}

export function checkHumor(humor: GenerationOutput['humor'], keywords: readonly string[]): Issue[] {
  const issues: Issue[] = [];
  humor.forEach((h, index) => {
    const topic = hasImitationPattern(h.text) || hasImitationPattern(h.purpose) ? 'real_person' : (forbiddenTopic(h.text) ?? forbiddenTopic(h.purpose));
    if (topic) issues.push({ kind: 'humor_topic', index, topic });
    const purpose = h.purpose.trim();
    const folded = purpose.normalize('NFC').toLowerCase();
    // Substring match: "vine" counts in "vines", "포도나무" in "포도나무에".
    const hasKeyword = keywords.some((k) => {
      const key = k.trim().normalize('NFC').toLowerCase();
      return key.length > 0 && folded.includes(key);
    });
    if (!purpose || !hasKeyword) issues.push({ kind: 'humor_purpose', index });
  });
  return issues;
}
