// ESLint flat config. Enforces CLAUDE.md rules 3, 4, 8, 9 and the UI → store boundary (4.4).
// The same rules are double-checked by grep in scripts/verify.sh (sermon-verify §3).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const INDEPENDENT_MODULES = ['bible', 'bible-import', 'selection', 'sermon', 'compose', 'persona', 'validate', 'vault', 'backup', 'store'];

const htmlInjection = [
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Render LLM/user text as text only (CLAUDE.md rule 9).' },
  { selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]", message: 'No innerHTML/outerHTML (CLAUDE.md rule 9).' },
  { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'No insertAdjacentHTML (CLAUDE.md rule 9).' },
];

export default tseslint.config(
  { ignores: ['dist/', 'dev-dist/', 'coverage/', 'node_modules/', 'test-results/', 'playwright-report/', 'tests/fixtures/', 'android/', 'ios/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'error',
      'no-restricted-syntax': ['error', ...htmlInjection],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use core/store (IndexedDB). CLAUDE.md rule 4.' },
        { name: 'sessionStorage', message: 'Use core/store (IndexedDB). CLAUDE.md rule 4.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'Use core/store. CLAUDE.md rule 4.' },
        { object: 'window', property: 'sessionStorage', message: 'Use core/store. CLAUDE.md rule 4.' },
      ],
    },
  },
  {
    // CLAUDE.md rule 3: independent-mode modules never import llm/generate.
    files: INDEPENDENT_MODULES.map((m) => `src/core/${m}/**/*.{ts,tsx}`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(llm|generate)(/|$)',
              message: 'Independent-mode modules must not import core/llm or core/generate (CLAUDE.md rule 3).',
            },
          ],
        },
      ],
    },
  },
  {
    // CLAUDE.md 4.4: screens go through core/store, never IndexedDB directly.
    files: ['src/app/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'idb', message: 'Use core/store (CLAUDE.md 4.4).' }], patterns: [{ group: ['idb/*'], message: 'Use core/store (CLAUDE.md 4.4).' }] },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'indexedDB', message: 'Use core/store (CLAUDE.md 4.4).' },
        { name: 'localStorage', message: 'Use core/store (IndexedDB). CLAUDE.md rule 4.' },
        { name: 'sessionStorage', message: 'Use core/store (IndexedDB). CLAUDE.md rule 4.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'indexedDB', message: 'Use core/store (CLAUDE.md 4.4).' },
        { object: 'window', property: 'localStorage', message: 'Use core/store. CLAUDE.md rule 4.' },
        { object: 'window', property: 'sessionStorage', message: 'Use core/store. CLAUDE.md rule 4.' },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
