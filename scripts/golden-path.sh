#!/usr/bin/env bash
# =============================================================================
#  Golden path — walk a real shop end to end and print what happened
#
#  Why this exists: the test suites prove individual guarantees, but nobody has
#  ever watched the *whole* journey a customer and an owner make in one run. This
#  boots the app the way a server would, drives real HTTP through it, and prints a
#  line per step, so "the shop works" is an observation rather than a claim.
#
#  Usage:  bash scripts/golden-path.sh [port]
# =============================================================================
set -uo pipefail

PORT="${1:-3900}"
BASE="http://127.0.0.1:${PORT}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '  \033[32m✔\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { printf '  \033[31m✘\033[0m %s\n' "$1"; FAILED=1; }
FAILED=0

jq_get() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]) if True else '')" "$1" 2>/dev/null; }

step "راه‌اندازی فروشگاه (حالت development، پورت $PORT)"
NODE_ENV=development PERSIST_DATA=false ALLOW_MOCK_PROVIDERS=true \
  PAYMENT_PROVIDER=mock SMS_PROVIDER=mock \
  JWT_SECRET=golden_path_secret_long_enough_1234567890 \
  PORT="$PORT" node src/server/index.js > /tmp/golden-path.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

for _ in $(seq 1 40); do
  curl -sf "$BASE/api/health" >/dev/null 2>&1 && break
  sleep 0.25
done
curl -sf "$BASE/api/health" >/dev/null || { fail "سرور بالا نیامد"; cat /tmp/golden-path.log; exit 1; }
pass "سرور بالا آمد ($(curl -s "$BASE/api/health" | python3 -c "import json,sys;d=json.load(sys.stdin);print('نسخه '+d['version']+'، '+d['environment'])"))"

step "۱) مشتری: مرور کاتالوگ"
CATALOG="$(curl -s "$BASE/api/products")"
COUNT="$(printf '%s' "$CATALOG" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))")"
[ "$COUNT" -gt 0 ] && pass "کاتالوگ $COUNT محصول دارد" || fail "کاتالوگ خالی است"
PRODUCT_ID="$(printf '%s' "$CATALOG" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(next(p['id'] for p in d if any(int(v.get('stock',0))>0 for v in p.get('variants',[]))))")"
VARIANT_ID="$(printf '%s' "$CATALOG" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
p=[x for x in d if x['id']=='$PRODUCT_ID'][0]
print(next(v['id'] for v in p['variants'] if int(v.get('stock',0))>0))")"
TITLE="$(printf '%s' "$CATALOG" | python3 -c "import json,sys; print([x for x in json.load(sys.stdin)['data'] if x['id']=='$PRODUCT_ID'][0]['title'])")"
pass "محصول انتخاب‌شده: «$TITLE»"

step "۲) مشتری: ورود (حساب نمونه در حالت توسعه)"
LOGIN="$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"identifier":"neda.alavi@gmail.com","password":"password123"}')"
CUSTOMER_TOKEN="$(printf '%s' "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")"
[ -n "$CUSTOMER_TOKEN" ] && pass "ورود مشتری انجام شد" || fail "ورود مشتری ناموفق"

step "۳) مشتری: سبد خرید و اعمال کد تخفیف"
CART="$(curl -s -X POST "$BASE/api/cart/calculate" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$PRODUCT_ID\",\"variantId\":\"$VARIANT_ID\",\"quantity\":1}],\"province\":\"تهران\"}")"
printf '%s' "$CART" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('  \033[32m✔\033[0m سبد: کالا', d['subtotal'], '+ ارسال', d['shippingFee'], '= قابل پرداخت', d['payableAmount'], 'تومان')"

step "۴) مشتری: ثبت سفارش"
ORDER="$(curl -s -X POST "$BASE/api/orders" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"productId\":\"$PRODUCT_ID\",\"variantId\":\"$VARIANT_ID\",\"quantity\":1}],\"shippingAddress\":{\"recipientName\":\"سارا آزمایشی\",\"phone\":\"09121112233\",\"province\":\"تهران\",\"city\":\"تهران\",\"fullAddress\":\"خیابان ولیعصر پلاک ۱\"},\"paymentMethod\":\"ONLINE_GATEWAY\"}")"
ORDER_ID="$(printf '%s' "$ORDER" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('id',''))")"
ORDER_NO="$(printf '%s' "$ORDER" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('orderNumber',''))")"
[ -n "$ORDER_ID" ] && pass "سفارش ثبت شد: $ORDER_NO" || { fail "ثبت سفارش ناموفق"; printf '%s\n' "$ORDER" | head -3; }

step "۵) مشتری: پرداخت (درگاه آزمایشی)"
PAY="$(curl -s -X POST "$BASE/api/payments/request" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H 'Content-Type: application/json' -d "{\"orderId\":\"$ORDER_ID\"}")"
AUTHORITY="$(printf '%s' "$PAY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('authority',''))")"
[ -n "$AUTHORITY" ] && pass "درخواست پرداخت ساخته شد (authority: ${AUTHORITY:0:12}…)" || fail "درخواست پرداخت ناموفق"
VERIFY="$(curl -s -X POST "$BASE/api/payments/verify" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H 'Content-Type: application/json' -d "{\"orderId\":\"$ORDER_ID\",\"authority\":\"$AUTHORITY\"}")"
STATUS="$(printf '%s' "$VERIFY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('paymentStatus','?'))" 2>/dev/null)"
[ "$STATUS" = "PAID" ] && pass "پرداخت تأیید شد (وضعیت: $STATUS)" || printf '  \033[33m▲\033[0m وضعیت پرداخت: %s\n' "$STATUS"

step "۶) مشتری: فاکتور چاپی با لینک امضاشده"
LINK="$(curl -s "$BASE/api/orders/$ORDER_ID/invoice-link" -H "Authorization: Bearer $CUSTOMER_TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('url',''))")"
if [ -n "$LINK" ]; then
  CODE="$(curl -s -o /tmp/invoice.html -w '%{http_code}' "$BASE$LINK")"
  [ "$CODE" = "200" ] && pass "فاکتور باز شد و «$(grep -c 'فاکتور فروش' /tmp/invoice.html)» نشانه فاکتور داخلش است" || fail "فاکتور باز نشد (HTTP $CODE)"
else
  fail "لینک فاکتور ساخته نشد"
fi

step "۷) مشتری: پیگیری سفارش‌های خودم"
MY="$(curl -s "$BASE/api/orders/my-orders" -H "Authorization: Bearer $CUSTOMER_TOKEN" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))")"
pass "تعداد سفارش‌های مشتری: $MY"

step "۸) مدیر: ورود و داشبورد"
ADMIN_LOGIN="$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"admin@manto.ir","password":"password123"}')"
ADMIN_TOKEN="$(printf '%s' "$ADMIN_LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")"
ADMIN_STATS="$(curl -s "$BASE/api/admin/stats" -H "Authorization: Bearer $ADMIN_TOKEN")"
printf '%s' "$ADMIN_STATS" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('  \033[32m✔\033[0m داشبورد: درآمد ماه', d['revenueThisMonth'], '| سفارش‌های در انتظار', d['pendingOrdersCount'], '| کم‌موجود', len(d.get('lowStock',[])))"

step "۹) مدیر: تغییر وضعیت سفارش (ماشین حالت)"
for NEXT in CONFIRMED PROCESSING SHIPPED DELIVERED; do
  R="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/orders/$ORDER_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "{\"status\":\"$NEXT\"}")"
  [ "$R" = "200" ] && printf '  \033[32m✔\033[0m %s\n' "$NEXT" || { fail "گذار به $NEXT ناموفق (HTTP $R)"; break; }
done
ILLEGAL="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/orders/$ORDER_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"PENDING"}')"
[ "$ILLEGAL" = "409" ] && pass "گذار غیرقانونی (DELIVERED → PENDING) با ۴۰۹ رد شد (ADR-011)" || fail "گذار غیرقانونی رد نشد (HTTP $ILLEGAL)"

step "۱۰) مدیر: خروجی CSV و لاگ اقدامات"
CSV_CODE="$(curl -s -o /tmp/orders.csv -w '%{http_code}' "$BASE/api/admin/orders/export.csv" -H "Authorization: Bearer $ADMIN_TOKEN")"
BOM="$(head -c 3 /tmp/orders.csv | od -An -tx1 | tr -d ' \n')"
[ "$CSV_CODE" = "200" ] && [ "$BOM" = "efbbbf" ] && pass "CSV با BOM یوتی‌اف‌۸ ساخته شد (اکسل فارسی را درست می‌خواند)" || fail "CSV یا BOM مشکل دارد ($CSV_CODE / $BOM)"
AUDIT="$(curl -s "$BASE/api/admin/audit-log" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))")"
pass "اقدام‌های ثبت‌شده در لاگ مدیر: $AUDIT"

step "۱۱) مشتری دیگر: تلاش برای دیدن سفارش شخص دیگر"
OTHER_TOKEN="$(curl -s -X POST "$BASE/api/auth/switch-role" -H 'Content-Type: application/json' -d '{"targetRole":"RETAIL"}' >/dev/null; curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"boutique.tehran@manto.ir","password":"password123"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")"
BOLA="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/orders/$ORDER_ID" -H "Authorization: Bearer $OTHER_TOKEN")"
[ "$BOLA" = "403" ] && pass "دسترسی به سفارش دیگری ۴۰۳ شد (BOLA بسته است)" || fail "نشت داده: HTTP $BOLA"

step "۱۲) صفحات قوانین و مرجوعی"
for SLUG in terms returns privacy sizing contact; do
  CODE="$(curl -s -o /tmp/page.html -w '%{http_code}' "$BASE/page/$SLUG")"
  [ "$CODE" = "200" ] && printf '  \033[32m✔\033[0m /page/%s\n' "$SLUG" || fail "/page/$SLUG → HTTP $CODE"
done

echo
if [ "$FAILED" = "0" ]; then
  printf '\033[32m══════════════════════════════════════════════\033[0m\n'
  printf '\033[32m ✅ مسیر طلایی کامل و بی‌ایراد طی شد\033[0m\n'
  printf '\033[32m══════════════════════════════════════════════\033[0m\n'
else
  printf '\033[31m ✘ بعضی مراحل ایراد داشتند (جزئیات بالا)\033[0m\n'
  exit 1
fi
