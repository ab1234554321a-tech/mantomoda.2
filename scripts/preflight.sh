#!/usr/bin/env bash
# =============================================================================
#  Manto Moda — pre-launch check (run this ON THE SERVER, before going live)
#
#  It verifies the mistakes that actually bite a first launch:
#    • the shop would forget every order (persistence off)
#    • a weak or missing JWT secret (tokens forgeable)
#    • live payment/SMS providers selected without credentials
#    • the payment callback pointing at localhost (money taken, order never confirmed)
#    • a data directory the app cannot write to
#    • no automatic backup, no HTTPS, no site URL for canonical links
#
#  Usage:  bash scripts/preflight.sh
#  Exit code 0 = green to launch, 1 = fix the reported items first.
# =============================================================================
set -uo pipefail

PASS=0; WARN=0; FAIL=0

ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
warn() { printf '  \033[33m▲\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
head2(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# Load .env when present (the app itself uses dotenv; this script runs standalone).
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

echo "=============================================="
echo " بررسی پیش از انتشار — مانتو مدا"
echo "=============================================="

head2 "۱) محیط اجرا"
NODE_BIN="$(command -v node || true)"
if [ -n "$NODE_BIN" ]; then
  NODE_MAJOR="$($NODE_BIN -v | sed 's/v\([0-9]*\).*/\1/')"
  if [ "$NODE_MAJOR" -ge 20 ]; then ok "نسخه Node: $($NODE_BIN -v)"; else bad "نسخه Node قدیمی است ($($NODE_BIN -v)) — حداقل ۲۰ لازم است"; fi
else
  bad "Node.js نصب نیست"
fi

[ -d node_modules ] && ok "وابستگی‌ها نصب شده‌اند" || bad "node_modules نیست — دستور: npm ci --omit=dev"
[ -f src/server/index.js ] && ok "کد سرور موجود است" || bad "src/server/index.js پیدا نشد (مسیر اشتباه؟)"

head2 "۲) امنیت و رمزها"
if [ -z "${JWT_SECRET:-}" ]; then
  bad "JWT_SECRET تنظیم نشده — با آن توکن ورود ساخته می‌شود و بدون آن امنیت نداریم"
elif [ "${#JWT_SECRET}" -lt 32 ]; then
  bad "JWT_SECRET کوتاه است (${#JWT_SECRET} کاراکتر) — حداقل ۳۲ کاراکتر تصادفی بگذارید"
elif [ "$JWT_SECRET" = "change-me" ] || printf '%s' "$JWT_SECRET" | grep -qiE 'secret|password|example'; then
  bad "JWT_SECRET پیش‌فرض/حدسی است — یک رشته تصادفی جدید بسازید"
else
  ok "JWT_SECRET مناسب است (${#JWT_SECRET} کاراکتر)"
fi

if [ "${NODE_ENV:-}" = "production" ]; then ok "NODE_ENV=production"; else warn "NODE_ENV=${NODE_ENV:-development} — روی سرور باید production باشد"; fi

# --- Owner account (ADR-024) -------------------------------------------------
# The role simulator hands out an admin token without a password and the demo
# accounts share a password published in the public repository, so a live shop
# must have its own login and must not have the demo scaffolding switched on.
if [ "${NODE_ENV:-}" = "production" ]; then
  if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
    bad "ADMIN_EMAIL/ADMIN_PASSWORD تنظیم نشده — بدون حساب مدیر واقعی، سرور در حالت production بالا نمی‌آید"
  elif [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
    bad "ADMIN_PASSWORD کوتاه است (${#ADMIN_PASSWORD} کاراکتر) — حداقل ۱۲ کاراکتر"
  else
    ok "حساب مدیر فروشگاه تعریف شده است ($ADMIN_EMAIL)"
  fi

  if [ "${ALLOW_DEMO_MODE:-false}" = "true" ]; then
    bad "ALLOW_DEMO_MODE=true — شبیه‌ساز نقش فعال است و هر کسی می‌تواند توکن مدیر بگیرد! روی فروشگاه واقعی false باشد"
  else
    ok "شبیه‌ساز نقش (دمو) خاموش است"
  fi

  if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
    warn "SEED_DEMO_DATA=true — کالاها، سفارش‌ها و مشتریان نمونه داخل فروشگاه واقعی بارگذاری می‌شوند"
  fi
else
  warn "بدون NODE_ENV=production، شبیه‌ساز نقش و داده نمونه فعال‌اند (برای توسعه درست است، برای سرور نه)"
fi

# A snapshot carried over from a demo install may still contain demo accounts.
if [ "${PERSIST_DATA:-false}" = "true" ]; then
  SNAP="${DATA_DIR:-./data}/manto-moda.json"
  if [ -f "$SNAP" ]; then
    DEMO_USERS="$(grep -c '"isDemo": *true' "$SNAP" 2>/dev/null || echo 0)"
    if [ "${DEMO_USERS:-0}" -gt 0 ]; then
      warn "$DEMO_USERS حساب نمونه در فایل داده وجود دارد — در حالت production از ورود محروم می‌شوند و در اولین ذخیره حذف می‌شوند"
    fi
  fi
fi

head2 "۳) ماندگاری داده (مهم‌ترین مورد)"
if [ "${PERSIST_DATA:-false}" = "true" ]; then
  ok "PERSIST_DATA=true — سفارش‌ها روی دیسک ذخیره می‌شوند"
else
  bad "PERSIST_DATA=true نیست — با هر ری‌استارت همه سفارش‌ها پاک می‌شوند!"
fi

DATA_DIR_RESOLVED="${DATA_DIR:-./data}"
if mkdir -p "$DATA_DIR_RESOLVED" 2>/dev/null; then
  PROBE="$DATA_DIR_RESOLVED/.preflight-write-test"
  if touch "$PROBE" 2>/dev/null; then rm -f "$PROBE"; ok "پوشه داده قابل نوشتن است ($DATA_DIR_RESOLVED)"; else bad "پوشه داده قابل نوشتن نیست: $DATA_DIR_RESOLVED"; fi
else
  bad "پوشه داده ساخته نشد: $DATA_DIR_RESOLVED (دسترسی فایل‌سیستم را بررسی کنید)"
fi

SNAPSHOT="$DATA_DIR_RESOLVED/manto-moda.json"
[ -f "$SNAPSHOT" ] && ok "اسنپ‌شات موجود است ($(wc -c < "$SNAPSHOT") بایت)" || warn "هنوز داده‌ای ذخیره نشده (طبیعی است اگر فروشگاه تازه نصب شده)"

UPLOAD_DIR_RESOLVED="${UPLOAD_DIR:-$DATA_DIR_RESOLVED/uploads}"
mkdir -p "$UPLOAD_DIR_RESOLVED" 2>/dev/null && ok "پوشه عکس‌ها آماده است ($UPLOAD_DIR_RESOLVED)" || bad "پوشه عکس‌ها ساخته نشد: $UPLOAD_DIR_RESOLVED"
case "$UPLOAD_DIR_RESOLVED" in
  "$DATA_DIR_RESOLVED"*) : ;;
  *) warn "پوشه عکس‌ها بیرون از DATA_DIR است — یادت باشد پشتیبان‌گیری هر دو را پوشش دهد" ;;
esac

FREE_MB="$(df -Pk "$DATA_DIR_RESOLVED" 2>/dev/null | awk 'NR==2 {print int($4/1024)}')"
if [ -n "$FREE_MB" ]; then
  if [ "$FREE_MB" -ge 1024 ]; then ok "فضای دیسک آزاد: ${FREE_MB} مگابایت"; else warn "فضای دیسک کم است: ${FREE_MB} مگابایت"; fi
fi

head2 "۴) درگاه پرداخت"
PAYMENT_PROVIDER_RESOLVED="${PAYMENT_PROVIDER:-zarinpal}"
case "$PAYMENT_PROVIDER_RESOLVED" in
  mock)
    if [ "${NODE_ENV:-}" = "production" ] && [ "${ALLOW_MOCK_PROVIDERS:-false}" != "true" ]; then
      bad "PAYMENT_PROVIDER=mock در محیط production — سرور بالا نمی‌آید؛ یا zarinpal بگذارید یا ALLOW_MOCK_PROVIDERS=true (فقط برای تست)"
    else
      warn "PAYMENT_PROVIDER=mock — پرداخت واقعی انجام نمی‌شود (فقط برای تست)"
    fi ;;
  zarinpal)
    if [ -n "${ZARINPAL_MERCHANT_ID:-}" ]; then ok "ZARINPAL_MERCHANT_ID تنظیم شده"; else bad "PAYMENT_PROVIDER=zarinpal ولی ZARINPAL_MERCHANT_ID خالی است — پرداخت کار نمی‌کند"; fi
    [ "${ZARINPAL_SANDBOX:-false}" = "true" ] && warn "ZARINPAL_SANDBOX=true — حالت آزمایشی است، پول واقعی جابه‌جا نمی‌شود"
    ;;
  *) warn "PAYMENT_PROVIDER ناشناخته: $PAYMENT_PROVIDER_RESOLVED" ;;
esac

CALLBACK="${PAYMENT_CALLBACK_BASE_URL:-}"
if [ -z "$CALLBACK" ]; then
  warn "PAYMENT_CALLBACK_BASE_URL خالی است — آدرس بازگشت از درگاه با دامنه درخواست ساخته می‌شود"
elif printf '%s' "$CALLBACK" | grep -qiE 'localhost|127\.0\.0\.1|0\.0\.0\.0'; then
  bad "آدرس بازگشت درگاه روی localhost است ($CALLBACK) — درگاه نمی‌تواند به آن برگردد و پرداخت مشتری تأیید نمی‌شود"
else
  case "$CALLBACK" in
    https://*) ok "آدرس بازگشت درگاه: $CALLBACK" ;;
    http://*) warn "آدرس بازگشت روی http است ($CALLBACK) — درگاه‌های ایرانی معمولاً https می‌خواهند" ;;
    *) bad "آدرس بازگشت نامعتبر است: $CALLBACK (باید با https:// شروع شود)" ;;
  esac
fi

head2 "۴.۵) سیاست‌های فروشگاه (تأیید مالک)"
# Terms, return window and refund timing are business promises, not code. They
# are drafted with sensible defaults and marked TODO-OWNER until confirmed.
PAGES_FILE="${PAGES_FILE:-src/server/content/pages.js}"
if [ -f "$PAGES_FILE" ]; then
  UNCONFIRMED="$(grep -c 'TODO-OWNER' "$PAGES_FILE" 2>/dev/null || echo 0)"
  if [ "${UNCONFIRMED:-0}" -gt 0 ]; then
    warn "$UNCONFIRMED مورد در صفحات قوانین/مرجوعی با مقدار پیش‌فرض منتشر می‌شود — باز کن و تأیید کن: $PAGES_FILE"
  else
    ok "سیاست‌های فروشگاه (مرجوعی، بازگشت وجه، ساعات پاسخ‌گویی) تأیید شده‌اند"
  fi
else
  warn "فایل محتوای صفحات پیدا نشد ($PAGES_FILE)"
fi

head2 "۵) پیامک"
SMS_PROVIDER_RESOLVED="${SMS_PROVIDER:-kavenegar}"
case "$SMS_PROVIDER_RESOLVED" in
  mock) warn "SMS_PROVIDER=mock — پیامک واقعی ارسال نمی‌شود (کد ورود در لاگ چاپ می‌شود)" ;;
  kavenegar)
    if [ -n "${KAVENEGAR_API_KEY:-}" ]; then ok "KAVENEGAR_API_KEY تنظیم شده"; else bad "SMS_PROVIDER=kavenegar ولی KAVENEGAR_API_KEY خالی است — ورود با پیامک کار نمی‌کند"; fi
    [ -n "${KAVENEGAR_SENDER:-}" ] && ok "شماره فرستنده: $KAVENEGAR_SENDER" || warn "KAVENEGAR_SENDER خالی است (برای بعضی پنل‌ها الزامی است)"
    ;;
  *) warn "SMS_PROVIDER ناشناخته: $SMS_PROVIDER_RESOLVED" ;;
esac

head2 "۶) سئو و آدرس عمومی"
if [ -z "${PUBLIC_SITE_URL:-}" ]; then
  warn "PUBLIC_SITE_URL خالی است — آدرس canonical و سایت‌مپ از دامنه درخواست ساخته می‌شود (روی سرور با Nginx درست کار می‌کند)"
else
  case "$PUBLIC_SITE_URL" in
    https://*) ok "PUBLIC_SITE_URL: $PUBLIC_SITE_URL" ;;
    *) warn "PUBLIC_SITE_URL باید با https:// شروع شود (اکنون: $PUBLIC_SITE_URL)" ;;
  esac
fi

head2 "۷) پشتیبان‌گیری"
if [ -f scripts/backup.sh ]; then
  ok "اسکریپت پشتیبان موجود است"
  if command -v crontab >/dev/null 2>&1; then
    if crontab -l 2>/dev/null | grep -q "scripts/backup.sh"; then
      ok "پشتیبان‌گیری زمان‌بندی شده است"
    else
      warn "پشتیبان‌گیری خودکار تنظیم نشده — این خط را به crontab اضافه کنید:"
      printf '      30 3 * * * cd %s && bash scripts/backup.sh --keep 30 >> logs/backup.log 2>&1\n' "$(pwd)"
    fi
  fi
else
  warn "scripts/backup.sh پیدا نشد"
fi

head2 "۸) پورت و سرویس"
PORT_RESOLVED="${PORT:-3000}"
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT_RESOLVED}\b"; then
  ok "پورت ${PORT_RESOLVED} در حال گوش دادن است (سرور فعال است)"
elif command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT_RESOLVED}/api/health" >/dev/null 2>&1; then
    ok "سرویس روی پورت ${PORT_RESOLVED} پاسخ می‌دهد"
  else
    warn "روی پورت ${PORT_RESOLVED} پاسخی نگرفتم — اگر هنوز سرویس را بالا نیاورده‌اید طبیعی است"
  fi
fi

echo
echo "=============================================="
printf ' نتیجه: \033[32m%d مورد سالم\033[0m | \033[33m%d هشدار\033[0m | \033[31m%d ایراد\033[0m\n' "$PASS" "$WARN" "$FAIL"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "❌ تا وقتی ایرادهای بالا رفع نشوند، فروشگاه را عمومی نکنید."
  echo "   (هر ایراد با ✘ مشخص شده و راه‌حلش کنارش نوشته شده است.)"
  exit 1
fi

if [ "$WARN" -gt 0 ]; then
  echo
  echo "✅ مانعی برای انتشار نیست، اما هشدارهای ▲ را هم بررسی کنید."
  exit 0
fi

echo
echo "🎉 همه‌چیز آماده انتشار است."
exit 0
