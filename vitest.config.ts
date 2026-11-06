import { defineConfig } from 'vitest/config';

// Coverage thresholds mirror .claude/skills/sermon-verify/SKILL.md §1.2. Change both together.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/index.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        lines: 80,
        'src/core/vault/**': { lines: 90 },
        'src/core/validate/**': { lines: 90 },
        'src/core/selection/**': { lines: 90 },
        'src/core/bible/reference*': { lines: 90 },
        'src/core/backup/**': { lines: 80 },
        'src/core/llm/**': { lines: 80 },
        'src/core/generate/**': { lines: 80 },
        'src/core/bible-import/**': { lines: 80 },
      },
    },
  },
});
