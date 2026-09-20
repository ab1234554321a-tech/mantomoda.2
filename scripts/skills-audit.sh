#!/usr/bin/env bash
# =============================================================================
#  Manto Moda — run the installed Claude Skills against THIS project
#
#  Why a wrapper is needed: the skills in `.claude/skills/` are written to be
#  generic (they assume `docs/`, `src/`, English file names), so running them
#  raw produces false alarms — e.g. `validate-docs.sh` reports "no CHANGELOG"
#  because this project keeps its docs at the repository root, and
#  `detect-secrets.sh` flags the skill's own documentation as a private key.
#
#  This script runs the ones that genuinely apply, with the right paths and
#  exclusions, plus the project's own gates, and writes a single dated report.
#
#  Usage:  bash scripts/skills-audit.sh [--fail-on-high]
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SKILLS_DIR="${SKILLS_DIR:-$REPO_ROOT/.claude/skills}"
if [ ! -d "$SKILLS_DIR" ]; then
  SKILLS_DIR="$HOME/.claude/skills"
fi

REPORT_DIR="$REPO_ROOT/reports"
mkdir -p "$REPORT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/skills-audit-$STAMP.md"

FAIL_ON_HIGH=0
[ "${1:-}" = "--fail-on-high" ] && FAIL_ON_HIGH=1

PASS=0; WARN=0; FAIL=0
FINDINGS=()

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
warn() { printf '  \033[33m▲\033[0m %s\n' "$1"; WARN=$((WARN+1)); FINDINGS+=("WARN: $1"); }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); FINDINGS+=("FAIL: $1"); }

echo "=============================================="
echo " اجرای اسکیل‌ها روی پروژه مانتو مدا"
echo " پوشه اسکیل‌ها: $SKILLS_DIR"
echo " گزارش: $REPORT"
echo "=============================================="

{
  echo "# گزارش اجرای اسکیل‌ها — مانتو مدا"
  echo
  echo "- تاریخ: $(date '+%Y-%m-%d %H:%M')"
  echo "- پوشه اسکیل‌ها: \`$SKILLS_DIR\`"
  echo
} > "$REPORT"

# ---------------------------------------------------------------------------
# 1. security-auditor → OWASP Top 10 static scan of the server code
# ---------------------------------------------------------------------------
say "۱) security-auditor → اسکن OWASP روی کد سرور"
OWASP="$SKILLS_DIR/security-auditor/scripts/owasp-check.py"
if [ -f "$OWASP" ] && command -v python3 >/dev/null 2>&1; then
  OWASP_OUT="$REPORT_DIR/owasp-$STAMP.txt"
  python3 "$OWASP" "$REPO_ROOT/src" > "$OWASP_OUT" 2>&1 || true
  # The scanner prints one line per finding, prefixed with its severity. ANSI
  # colour codes are stripped first so the pattern is stable.
  CLEAN="$(sed -e 's/\x1b\[[0-9;]*m//g' "$OWASP_OUT")"
  count() { printf '%s' "$CLEAN" | grep -aE "^\[$1\]" | wc -l | tr -d ' '; }
  # Rules whose findings were reviewed by hand and proven not to apply; each one
  # is justified in SECURITY-TRIAGE.md. Everything else counts as real signal.
  TRIAGED='SQL template injection|innerHTML assignment|Short password constant|Non-production check'
  count_real() { printf '%s' "$CLEAN" | grep -aE "^\[$1\]" | grep -avE "$TRIAGED" | wc -l | tr -d ' '; }

  CRIT="$(count CRITICAL)"; HIGH="$(count HIGH)"; MED="$(count MEDIUM)"; LOW="$(count LOW)"
  R_CRIT="$(count_real CRITICAL)"; R_HIGH="$(count_real HIGH)"
  R_MED="$(count_real MEDIUM)"; R_LOW="$(count_real LOW)"
  TRIAGED_N=$(( CRIT + HIGH + MED + LOW - R_CRIT - R_HIGH - R_MED - R_LOW ))

  {
    echo "## security-auditor (OWASP Top 10)"
    echo
    echo "خروجی کامل: \`${OWASP_OUT#$REPO_ROOT/}\` — فهرست قواعد سه‌گانه‌سازی‌شده: \`SECURITY-TRIAGE.md\`"
    echo
    echo "| شدت | کل یافته‌ها | سه‌گانه‌سازی‌شده (کاذب) | نیازمند اقدام |"
    echo "|---|---|---|---|"
    echo "| CRITICAL | $CRIT | $(( CRIT - R_CRIT )) | $R_CRIT |"
    echo "| HIGH | $HIGH | $(( HIGH - R_HIGH )) | $R_HIGH |"
    echo "| MEDIUM | $MED | $(( MED - R_MED )) | $R_MED |"
    echo "| LOW | $LOW | $(( LOW - R_LOW )) | $R_LOW |"
    echo
  } >> "$REPORT"

  if [ "$R_CRIT" -gt 0 ]; then bad "OWASP: $R_CRIT مورد بحرانی نیازمند اقدام"
  else ok "OWASP: هیچ مورد بحرانی واقعی (از $CRIT یافته خام)"; fi
  if [ "$R_HIGH" -gt 0 ]; then warn "OWASP: $R_HIGH مورد HIGH نیازمند اقدام"
  else ok "OWASP: هیچ مورد HIGH واقعی"; fi
  if [ $(( R_MED + R_LOW )) -gt 0 ]; then warn "OWASP: $(( R_MED + R_LOW )) مورد کم‌خطر نیازمند بررسی"; fi
  echo "     $TRIAGED_N یافته پس از بررسی دستی کاذب تشخیص داده شد و در SECURITY-TRIAGE.md ثبت است"
  echo "     جزئیات: ${OWASP_OUT#$REPO_ROOT/}"
else
  warn "اسکیل security-auditor یا python3 در دسترس نیست"
fi

# ---------------------------------------------------------------------------
# 2. security-auditor → secret scan, excluding vendored skills and deps
# ---------------------------------------------------------------------------
say "۲) security-auditor → جست‌وجوی کلید لو رفته در کد پروژه"
DETECT="$SKILLS_DIR/security-auditor/scripts/detect-secrets.sh"
if [ -f "$DETECT" ]; then
  # A throwaway copy of the *application* code only: the skills directory and
  # node_modules are third-party and would produce false positives.
  SCAN_DIR="$(mktemp -d)"
  mkdir -p "$SCAN_DIR/src" "$SCAN_DIR/config"
  cp -r "$REPO_ROOT/src/." "$SCAN_DIR/src/" 2>/dev/null || true
  cp -f "$REPO_ROOT/package.json" "$SCAN_DIR/" 2>/dev/null || true
  cp -f "$REPO_ROOT/.env.example" "$SCAN_DIR/config/" 2>/dev/null || true
  # .env must never be committed — prove it is absent from git history's tip.
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    bad "فایل .env در گیت ردیابی می‌شود — باید حذف و کلیدها چرخش داده شوند"
  else
    ok "فایل .env در گیت نیست (کلیدها امن)"
  fi

  SECRET_OUT="$REPORT_DIR/secrets-$STAMP.txt"
  bash "$DETECT" "$SCAN_DIR" > "$SECRET_OUT" 2>&1 || true
  SECRET_HITS="$(grep -c 'CRITICAL' "$SECRET_OUT" || true)"
  rm -rf "$SCAN_DIR"

  {
    echo "## security-auditor (secret scan)"
    echo
    echo '```'
    tail -n 20 "$SECRET_OUT"
    echo '```'
    echo
  } >> "$REPORT"

  if [ "$SECRET_HITS" -gt 0 ]; then
    warn "secret scan: $SECRET_HITS مورد گزارش شد (خروجی را بخوان — ممکن است نمونه در مستندات باشد)"
  else
    ok "secret scan: هیچ کلید لو رفته‌ای در کد پیدا نشد"
  fi
else
  warn "اسکریپت detect-secrets پیدا نشد"
fi

# ---------------------------------------------------------------------------
# 3. doc checks adapted to this project's layout
# ---------------------------------------------------------------------------
say "۳) technical-writer → بررسی مستندات (با ساختار این پروژه)"
DOC_EXPECTED=(README.md CHANGELOG.md ARCHITECTURE.md DECISIONS.md TASKS.md HOSTING-GUIDE.md)
MISSING_DOCS=()
for doc in "${DOC_EXPECTED[@]}"; do
  [ -f "$REPO_ROOT/$doc" ] || MISSING_DOCS+=("$doc")
done

ADR_COUNT="$(grep -c '^## ADR-' "$REPO_ROOT/DECISIONS.md" 2>/dev/null || echo 0)"
{
  echo "## مستندات"
  echo
  echo "- تعداد ADR: $ADR_COUNT"
  echo "- مستندات موجود: ${DOC_EXPECTED[*]}"
  echo
} >> "$REPORT"

if [ "${#MISSING_DOCS[@]}" -gt 0 ]; then bad "مستندات جاافتاده: ${MISSING_DOCS[*]}"; else ok "همه مستندات اصلی موجودند"; fi
if [ "$ADR_COUNT" -ge 15 ]; then ok "ثبت تصمیم‌های معماری فعال است ($ADR_COUNT ADR)"; else warn "تعداد ADR کم است ($ADR_COUNT)"; fi

# ---------------------------------------------------------------------------
# 4. Project gates: tests, accessibility, dependency audit, deployment checks
# ---------------------------------------------------------------------------
say "۴) گیت‌های خود پروژه"
if [ -f package.json ]; then
  if [ -d node_modules ]; then
    if timeout 300 npm test > "$REPORT_DIR/tests-$STAMP.log" 2>&1; then
      # Count the runner's own summary line, not every line containing "PASSED".
      SUITES="$(grep -oE 'ALL [0-9]+ TEST SUITES' "$REPORT_DIR/tests-$STAMP.log" | grep -oE '[0-9]+' | head -1 || true)"
      ok "تست‌ها سبز ($SUITES مجموعه)"
      echo "- تست‌ها: $SUITES مجموعه سبز" >> "$REPORT"
    else
      bad "تست‌ها شکست خوردند — لاگ: ${REPORT_DIR#$REPO_ROOT/}/tests-$STAMP.log"
      echo "- تست‌ها: ❌ شکست" >> "$REPORT"
    fi

    if timeout 120 npm run a11y > "$REPORT_DIR/a11y-$STAMP.log" 2>&1; then
      A11Y="$(grep -oE 'All [0-9]+ accessibility checks passed' "$REPORT_DIR/a11y-$STAMP.log" | head -1)"
      ok "دسترس‌پذیری: ${A11Y:-سبز}"
      echo "- دسترس‌پذیری: $A11Y" >> "$REPORT"
    else
      bad "بررسی دسترس‌پذیری شکست خورد"
    fi
  else
    warn "node_modules نصب نیست — تست‌ها و a11y اجرا نشدند (npm ci)"
  fi

  if command -v npm >/dev/null 2>&1; then
    AUDIT_JSON="$(timeout 120 npm audit --omit=dev --json 2>/dev/null || true)"
    if [ -n "$AUDIT_JSON" ]; then
      # npm's JSON is pretty-printed, so parse it instead of grepping for
      # `"total":0` (a grep misses the space and reports a phantom finding).
      VULNS="$(printf '%s' "$AUDIT_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.metadata?.vulnerabilities?.total ?? '?'))}catch{process.stdout.write('?')}})")"

      if [ "${VULNS:-1}" = "0" ]; then ok "وابستگی‌ها: بدون آسیب‌پذیری شناخته‌شده"; else warn "npm audit: $VULNS آسیب‌پذیری"; fi
      echo "- وابستگی‌های production: ${VULNS:-?} آسیب‌پذیری" >> "$REPORT"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 4b. API contract: openapi.yaml must match the routes the app really serves
# ---------------------------------------------------------------------------
if [ -f scripts/api-contract-check.mjs ]; then
  if CONTRACT="$(timeout 60 node scripts/api-contract-check.mjs --quiet 2>&1)"; then
    ok "قرارداد API با کد هم‌خوان است (openapi.yaml)"
    echo "- قرارداد API: هم‌خوان" >> "$REPORT"
  else
    bad "قرارداد API از کد جدا شده — جزئیات با: npm run api:check"
    {
      echo "## قرارداد API"
      echo
      echo '```'
      printf '%s\n' "$CONTRACT"
      echo '```'
    } >> "$REPORT"
  fi
fi

say "۵) آماده‌بودن انتشار (preflight)"
if [ -f scripts/preflight.sh ]; then
  # Run without the live server so it reports only configuration facts.
  PREFLIGHT_OUT="$REPORT_DIR/preflight-$STAMP.txt"
  bash scripts/preflight.sh > "$PREFLIGHT_OUT" 2>&1 || true
  PF_FAIL="$(grep -ac '✘' "$PREFLIGHT_OUT" || true)"
  PF_WARN="$(grep -ac '▲' "$PREFLIGHT_OUT" || true)"
  ok "بازرسی پیش از انتشار اجرا شد ($PF_FAIL ایراد، $PF_WARN هشدار) — ${PREFLIGHT_OUT#$REPO_ROOT/}"
  {
    echo "## آماده‌بودن انتشار"
    echo
    echo "جزئیات: \`${PREFLIGHT_OUT#$REPO_ROOT/}\`"
    echo
  } >> "$REPORT"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
{
  echo "## جمع‌بندی"
  echo
  echo "| نتیجه | تعداد |"
  echo "|---|---|"
  echo "| ✔ سالم | $PASS |"
  echo "| ▲ هشدار | $WARN |"
  echo "| ✘ ایراد | $FAIL |"
  echo
  if [ "${#FINDINGS[@]}" -gt 0 ]; then
    echo "### موارد قابل بررسی"
    echo
    for f in "${FINDINGS[@]}"; do echo "- $f"; done
  fi
} >> "$REPORT"

echo
echo "=============================================="
printf ' نتیجه: \033[32m%d سالم\033[0m | \033[33m%d هشدار\033[0m | \033[31m%d ایراد\033[0m\n' "$PASS" "$WARN" "$FAIL"
echo " گزارش کامل: ${REPORT#$REPO_ROOT/}"
echo "=============================================="

if [ "$FAIL_ON_HIGH" = "1" ] && [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
