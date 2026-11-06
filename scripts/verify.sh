#!/usr/bin/env bash
# Verification gates. Definition: .claude/skills/sermon-verify/SKILL.md
#   scripts/verify.sh quick   # typecheck, lint (+i18n), unit tests, static checks
#   scripts/verify.sh full    # quick + coverage, network, e2e, verify:db, build, dist audit, config
# Last line: VERIFY <mode>: PASS | FAIL (<failed gates>)
set -u
cd "$(dirname "$0")/.."

MODE="${1:-quick}"
case "$MODE" in quick|full) ;; *) echo "usage: $0 quick|full" >&2; exit 2 ;; esac

declare -a RESULTS=()
FAILED=()

record() { # name status [note]
  RESULTS+=("$(printf '%-28s %s%s' "$1" "$2" "${3:+  ($3)}")")
  [ "$2" = FAIL ] && FAILED+=("$1")
  return 0
}

run_gate() { # name cmd...
  local name="$1"; shift
  echo "── $name"
  if "$@"; then record "$name" PASS; else record "$name" FAIL; fi
}

has_files() { # dir glob — true if at least one matching file exists
  [ -d "$1" ] && find "$1" -type f -name "$2" | grep -q .
}

# ── Node version (.nvmrc)
need_major="$(cut -d. -f1 .nvmrc 2>/dev/null || echo 22)"
have_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$have_major" -lt "$need_major" ]; then
  echo "node $(node -v 2>/dev/null) < $need_major (see .nvmrc)" >&2
  record "node>=$need_major" FAIL "found $(node -v 2>/dev/null || echo none)"
  printf '%s\n' "${RESULTS[@]}"; echo "VERIFY $MODE: FAIL (node>=$need_major)"; exit 1
fi

# ── Static checks (sermon-verify §3). Each prints offending lines; any output = FAIL.
static_check() { # name pattern-cmd...
  local name="$1"; shift
  local out
  out="$("$@" 2>/dev/null)"
  if [ -n "$out" ]; then echo "$out"; record "static:$name" FAIL; else record "static:$name" PASS; fi
}
existing() { for p in "$@"; do [ -e "$p" ] && printf '%s\n' "$p"; done; }

run_static() {
  echo "── static checks"
  local indep
  indep=$(existing src/core/{bible,bible-import,selection,sermon,compose,persona,validate,vault,backup,store})
  # (3) independent modules must not import llm/generate
  # shellcheck disable=SC2086
  static_check "no-llm-import" grep -rnE "(from|import)\s*\(?\s*['\"]([^'\"]*/)?(llm|generate)(/[^'\"]*)?['\"]" $indep
  # (9) no HTML injection
  static_check "no-innerHTML" grep -rnE "dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML" src
  # (4) no plaintext browser storage
  static_check "no-web-storage" grep -rnE "\b(localStorage|sessionStorage)\b" src
  # (8) no console output
  static_check "no-console" grep -rnE "\bconsole\.(log|info|debug|warn|error|trace)\(" src --include=*.ts --include=*.tsx
  # (23) no URLs in src
  static_check "no-url-in-src" grep -rnE "https?://" src --include=*.ts --include=*.tsx
  # (16) no hardcoded Hangul in screen code
  # shellcheck disable=SC2046
  static_check "no-hangul-in-ui" grep -rnP "[\x{AC00}-\x{D7A3}]" $(existing src/app src/ui) --include=*.ts --include=*.tsx
  # (4) no extractable keys
  static_check "no-extractable-key" grep -rnE "extractable\s*:\s*true|generateKey\([^)]*,\s*true\s*," src
  # (1) no server packages
  static_check "no-server-deps" grep -nE "\"(express|fastify|koa|@hapi/hapi|hono|@vercel/node|@netlify/functions|firebase-functions|http-proxy|http-proxy-middleware)\"" package.json
  # (13) no desktop-only interactions
  static_check "no-desktop-events" grep -rnE "onMouseEnter|onMouseOver|onContextMenu=\{[^}]*\b(open|show)|shiftKey|:hover" src
  # (DESIGN 3.16) font sizes in rem only
  static_check "font-size-rem" grep -rnE "font-size:\s*[0-9.]+px|fontSize:\s*['\"]?[0-9.]+px" src
  # (17) excluded bibles not active in config
  echo "── config bibles"
  if node scripts/check-config.mjs --bibles; then record "static:config-bibles" PASS; else record "static:config-bibles" FAIL; fi
}

# ── quick
run_gate "typecheck" npx --no-install tsc --noEmit -p tsconfig.json
run_gate "lint" npm run --silent lint
if [ "$MODE" = quick ]; then
  if has_files tests/unit '*.test.ts' || has_files tests/unit '*.test.tsx'; then
    run_gate "unit" npm run --silent test
  else record "unit" SKIP "no unit tests"; fi
fi
run_static

# ── full
if [ "$MODE" = full ]; then
  if has_files tests/unit '*.test.ts' || has_files tests/unit '*.test.tsx'; then
    run_gate "unit+coverage" npm run --silent test:coverage
  else record "unit+coverage" SKIP "no unit tests"; fi

  if has_files tests/network '*.spec.ts'; then run_gate "network" npm run --silent test:network
  else record "network" SKIP "no network tests"; fi

  if has_files tests/e2e '*.spec.ts'; then run_gate "e2e" npm run --silent test:e2e
  else record "e2e" SKIP "no e2e tests"; fi

  if [ -f public/data/bible.sqlite ]; then run_gate "verify:db" npm run --silent verify:db
  elif grep -qE '^\| \[S01\].*\| DONE \|' docs/spec/README.md; then
    record "verify:db" FAIL "public/data/bible.sqlite absent (run npm run db:build)"
  else record "verify:db" SKIP "public/data/bible.sqlite absent (before S01)"; fi

  run_gate "build" npm run --silent build

  echo "── dist audit"
  if [ -d dist ]; then
    static_check "dist-no-remote-resources" grep -rnoE "<(script|link|img)[^>]+(src|href)=\"https?://" dist
    static_check "dist-no-trackers" grep -rnoE "fonts\.(googleapis|gstatic)\.com|googletagmanager|google-analytics|sentry\.io|datadog|mixpanel|amplitude" dist
    static_check "dist-no-key-strings" grep -rnoE "AIza[0-9A-Za-z_-]{30,}|sk-ant-[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,}" dist
    static_check "dist-no-txt-bibles" sh -c 'find dist -iname "*.txt" ! -name robots.txt'
    run_gate "dist-csp" node scripts/check-csp.mjs dist/index.html
  else record "dist audit" FAIL "dist/ missing"; fi

  run_gate "config" node scripts/check-config.mjs
fi

echo
echo "══ summary ($MODE)"
printf '%s\n' "${RESULTS[@]}"
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "VERIFY $MODE: PASS"
else
  echo "VERIFY $MODE: FAIL (${FAILED[*]})"
  exit 1
fi
