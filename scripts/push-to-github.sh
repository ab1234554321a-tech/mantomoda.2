#!/usr/bin/env bash
# =============================================================================
#  Manto Moda — push everything to GitHub in one command
#
#  Why this exists: uploading through the GitHub web UI means drag-and-drop and
#  "did every file make it?" anxiety. This does the same job in one command and
#  then *verifies* that the remote really received the commits.
#
#  Usage:
#    GITHUB_TOKEN=ghp_xxx bash scripts/push-to-github.sh
#    bash scripts/push-to-github.sh ghp_xxx          # token as argument
#    bash scripts/push-to-github.sh                  # will prompt (hidden input)
#
#  Options (env):
#    REPO_URL   default https://github.com/ab1234554321a-tech/mantomoda.2.git
#    BRANCH     default main
#    FORCE=1    force-push (only use if you know the remote diverged)
#
#  About the token: create a *fine-grained* personal access token, scoped to this
#  single repository, with "Contents: Read and write". That is the least privilege
#  that can push. Revoke it from GitHub any time afterwards.
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ab1234554321a-tech/mantomoda.2.git}"
BRANCH="${BRANCH:-main}"
FORCE="${FORCE:-0}"

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m▲\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31m✘ %s\033[0m\n' "$1" >&2; exit 1; }

# --- Token -------------------------------------------------------------------
# Three ways in, in this order: $GITHUB_TOKEN / first argument, a token file
# (so it never lands in the shell history), or a hidden prompt.
TOKEN="${GITHUB_TOKEN:-${1:-}}"
TOKEN_FILE=""
for candidate in "$PWD/.github-token" "$HOME/.github-token"; do
  if [ -z "$TOKEN" ] && [ -s "$candidate" ]; then
    TOKEN="$(tr -d '[:space:]' < "$candidate")"
    TOKEN_FILE="$candidate"
  fi
done
if [ -n "$TOKEN_FILE" ]; then
  ok "توکن از فایل خوانده شد: $TOKEN_FILE"
  echo "  (این فایل در .gitignore است و هرگز کامیت نمی‌شود؛ بعد از ارسال می‌توانی پاکش کنی)"
fi

if [ -z "$TOKEN" ]; then
  say "اعتبارنامه گیت‌هاب لازم است"
  echo "  ساده‌ترین راه (لینک از قبل پر شده — فقط Generate و کپی):"
  echo "    https://github.com/settings/tokens/new?description=mantomoda-push&scopes=repo"
  echo "  یا نسخه دقیق‌تر (فقط همین مخزن، Contents: Read and write):"
  echo "    https://github.com/settings/personal-access-tokens/new?name=mantomoda"
  printf '  توکن را بچسبان و Enter بزن (چیزی نمایش داده نمی‌شود): '
  read -rs TOKEN
  echo
fi

[ -n "$TOKEN" ] || die "توکنی وارد نشد"

# --- Repo & branch sanity ----------------------------------------------------
say "بررسی مخزن"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "این پوشه یک مخزن گیت نیست"
cd "$REPO_ROOT"
ok "پوشه پروژه: $REPO_ROOT"

git rev-parse --verify HEAD >/dev/null 2>&1 || die "هیچ کامیتی برای ارسال وجود ندارد"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT_BRANCH" = "$BRANCH" ] || warn "شاخه فعلی $CURRENT_BRANCH است؛ به $BRANCH ارسال می‌شود"

if [ -n "$(git status --porcelain)" ]; then
  warn "تغییر ثبت‌نشده وجود دارد — ابتدا commit کن (این اسکریپت فقط push می‌کند)"
  git status --short | head -10
  die "کامیت کن و دوباره اجرا کن: git add -A && git commit -m \"…\""
fi
ok "همه تغییرات کامیت شده‌اند"

# --- A shallow clone cannot be pushed to GitHub ------------------------------
# GitHub refuses "shallow update not allowed", which looks like a credential
# error but is not. Complete the history first, from the remote we already have.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo false)" = "true" ]; then
  warn "این مخزن shallow است — گیت‌هاب push از مخزن shallow را رد می‌کند"
  if git remote get-url origin >/dev/null 2>&1; then FETCH_FROM="origin"; else FETCH_FROM="$REPO_URL"; fi
  echo "  در حال کامل‌کردن تاریخچه از $FETCH_FROM …"
  if git fetch --unshallow "$FETCH_FROM" 2>&1 | tail -2; then
    ok "تاریخچه کامل شد ($(git rev-list --count HEAD) کامیت)"
  else
    die "کامل‌کردن تاریخچه ناموفق بود — اتصال اینترنت یا صحت REPO_URL را بررسی کن"
  fi
fi

# --- Divergence: the remote must be an ancestor of what we are sending -------
REMOTE_BEFORE="$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}')"
if [ -n "$REMOTE_BEFORE" ] && ! git cat-file -e "$REMOTE_BEFORE^{commit}" 2>/dev/null; then
  # The remote tip is unknown locally (another machine pushed). Fetch just that
  # history — no working-tree change — so the ancestor test below can run and
  # explain the situation instead of letting git fail with a raw error.
  git fetch -q "$REPO_URL" "$BRANCH" 2>/dev/null || true
fi
if [ -n "$REMOTE_BEFORE" ] && git cat-file -e "$REMOTE_BEFORE^{commit}" 2>/dev/null; then
  if ! git merge-base --is-ancestor "$REMOTE_BEFORE" HEAD 2>/dev/null; then
    warn "شاخه $BRANCH روی گیت‌هاب کامیت‌هایی دارد که محلی نداری (واگرایی)"
    die "اول \"git pull origin $BRANCH\" را بزن، یا اگر مطمئنی که نسخه محلی درست است: FORCE=1"
  fi
  ok "تاریخچه محلی روی نسخه گیت‌هاب سوار می‌شود (بدون بازنویسی تاریخچه)"
fi

# Which commits are about to travel (used by the scope check below).
REPO_URL_REF="origin/$BRANCH..HEAD"
if ! git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then REPO_URL_REF="HEAD"; fi
if ! git log --oneline "$REPO_URL_REF" >/dev/null 2>&1; then REPO_URL_REF="HEAD"; fi

COMMIT_COUNT="$(git rev-list --count HEAD)"
LAST_COMMIT="$(git log -1 --format='%h %s')"
say "آماده ارسال"
echo "  تعداد کامیت‌های محلی: $COMMIT_COUNT"
echo "  آخرین کامیت: $LAST_COMMIT"

# --- Scope check: catch GitHub's least obvious rejection before it happens ----
# A token with `repo` but without `workflow` is refused with a message that
# sounds like a permissions problem ("refusing to allow a Personal Access Token
# to create or update workflow") while everything else about the token is fine.
# The scopes are readable from the API, so they are checked up front.
if command -v curl >/dev/null 2>&1; then
  SCOPES="$(curl -s -I -H "Authorization: Bearer $TOKEN" https://api.github.com/user 2>/dev/null \
    | tr -d '\r' | awk 'tolower($1) == "x-oauth-scopes:" { $1=""; print substr($0,2) }')"
  if [ -n "$SCOPES" ]; then
    ok "دسترسی‌های توکن: $SCOPES"
    TOUCHES_WORKFLOWS="$(git log --name-only --format= "$REPO_URL_REF" 2>/dev/null | grep -c '^\.github/workflows/' || true)"
    if [ "${TOUCHES_WORKFLOWS:-0}" -gt 0 ] && ! printf '%s' "$SCOPES" | grep -q 'workflow'; then
      warn "در این ارسال فایل .github/workflows/ تغییر کرده، ولی توکن دسترسی workflow ندارد"
      die "همان توکن را با دسترسی workflow بساز (یک کلیک، از قبل پر شده):
     https://github.com/settings/tokens/new?description=mantomoda-push&scopes=repo,workflow"
    fi
  fi
fi

# --- Push --------------------------------------------------------------------
# The token travels in the remote URL for this single command and is never
# written to disk, so nothing secret ends up in .git/config.
say "ارسال به گیت‌هاب"
AUTH_URL="$(printf '%s' "$REPO_URL" | sed -E "s#https://#https://x-access-token:${TOKEN}@#")"

PUSH_ARGS=(--set-upstream "$AUTH_URL" "$BRANCH")
[ "$FORCE" = "1" ] && PUSH_ARGS=(--force "${PUSH_ARGS[@]}")

# Run the push, then print its output with the token masked. The status is read
# from git itself (not from the pipe) so a rejected push can never look like a
# success.
PUSH_LOG=""
PUSH_STATUS=0
PUSH_LOG="$(GIT_TERMINAL_PROMPT=0 git push "${PUSH_ARGS[@]}" 2>&1)" || PUSH_STATUS=$?
printf '%s\n' "$PUSH_LOG" | sed -E "s#${TOKEN}#***#g"

if [ "$PUSH_STATUS" -eq 0 ]; then
  ok "ارسال انجام شد"
else
  echo
  echo "  علت‌های رایج این خطا:"
  echo "   • توکن منقضی/نامعتبر است، یا دسترسی Contents: Read and write ندارد"
  echo "   • توکن فقط برای مخزن دیگری ساخته شده است"
  echo "   • تاریخچه گیت‌هاب و محلی واگرا شده‌اند (FORCE=1 فقط اگر مطمئنی)"
  exit "$PUSH_STATUS"
fi

unset TOKEN AUTH_URL

# --- Verify: prove the remote really has the work -----------------------------
say "بررسی صحت ارسال"
REMOTE_HEAD="$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}')"
LOCAL_HEAD="$(git rev-parse HEAD)"

echo "  کامیت محلی:      ${LOCAL_HEAD:0:10}"
echo "  کامیت روی گیت‌هاب: ${REMOTE_HEAD:0:10}"

if [ "$REMOTE_HEAD" = "$LOCAL_HEAD" ]; then
  ok "گیت‌هاب دقیقاً همین نسخه را دارد — دیگر نیازی به آپلود دستی نیست"
  echo
  echo "  آدرس مخزن: ${REPO_URL%.git}"
  echo "  اکنون می‌توانی روی سرور این را بزنی:"
  echo "    git clone ${REPO_URL%.git}.git /srv/mantomoda-src"
  echo "    cd /srv/mantomoda-src && DOMAIN=دامنه‌تو bash scripts/server-install.sh"
else
  warn "کامیت‌ها یکی نیستند — یک بار دیگر اجرا کن یا با FORCE=1 امتحان کن"
  exit 1
fi
