#!/usr/bin/env bash
# =============================================================================
#  Manto Moda — one-command server setup (Ubuntu 22.04 / 24.04)
#
#  What it does, in order:
#    1. checks that it runs as root on a supported OS;
#    2. installs Docker + the compose plugin if they are missing;
#    3. creates a dedicated service user and a deploy directory;
#    4. copies the project into place (or uses the current directory);
#    5. generates a strong JWT_SECRET *and the owner's admin login* into .env on
#       first run (the password is printed once, at the end of the install);
#    6. builds and starts the shop with restart-always;
#    7. optionally installs Nginx + a free HTTPS certificate when DOMAIN is set;
#    8. runs the pre-launch check and prints what is still needed.
#
#  Usage (on the server, as root):
#      DOMAIN=shop.example.com bash scripts/server-install.sh
#  or without a domain (shop reachable on http://SERVER_IP:3000):
#      bash scripts/server-install.sh
#
#  Safe to run twice: every step checks before it changes anything.
# =============================================================================
set -euo pipefail

APP_USER="${APP_USER:-manto}"
APP_DIR="${APP_DIR:-/srv/mantomoda}"
DOMAIN="${DOMAIN:-}"
SSH_PORT="${SSH_PORT:-22}"

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
note() { printf '  \033[33m•\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31m✘ %s\033[0m\n' "$1" >&2; exit 1; }

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say "بررسی پیش‌نیازها"
[ "$(id -u)" -eq 0 ] || die "این اسکریپت باید با دسترسی root اجرا شود. مثال: sudo bash scripts/server-install.sh"
[ -f /etc/os-release ] || die "سیستم‌عامل شناسایی نشد (این اسکریپت برای Ubuntu/Debian نوشته شده است)"
. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ok "سیستم‌عامل: ${PRETTY_NAME:-$ID}" ;;
  *) die "این اسکریپت برای Ubuntu/Debian است (سیستم فعلی: ${ID:-ناشناخته})" ;;
esac
[ -f "$SRC_DIR/package.json" ] || die "package.json پیدا نشد — این فایل را از داخل پوشه پروژه اجرا کنید"
ok "پوشه پروژه: $SRC_DIR"

say "نصب Docker (اگر نصب نباشد)"
if command -v docker >/dev/null 2>&1; then
  ok "Docker از قبل نصب است ($(docker --version | cut -d, -f1))"
else
  note "در حال نصب Docker…"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/"${ID}"/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
  systemctl enable --now docker
  ok "Docker نصب شد ($(docker --version | cut -d, -f1))"
fi

docker compose version >/dev/null 2>&1 || die "افزونه docker compose نصب نشد"

say "آماده‌سازی کاربر سرویس و پوشه پروژه"
if id "$APP_USER" >/dev/null 2>&1; then
  ok "کاربر $APP_USER از قبل وجود دارد"
else
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  ok "کاربر سیستمی $APP_USER ساخته شد (بدون امکان ورود)"
fi
usermod -aG docker "$APP_USER"

mkdir -p "$APP_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  note "کپی فایل‌های پروژه به $APP_DIR …"
  # Copies the code but never the local runtime data or dependencies.
  tar -cf - -C "$SRC_DIR" \
      --exclude=node_modules --exclude=.git --exclude=data --exclude=backups \
      --exclude=logs --exclude='*.log' . | tar -xf - -C "$APP_DIR"
  ok "فایل‌ها کپی شدند"
else
  ok "پروژه همین‌جا اجرا می‌شود"
fi

mkdir -p "$APP_DIR/data/uploads" "$APP_DIR/backups" "$APP_DIR/logs"

say "تنظیم فایل محیطی (.env)"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-48)"
  # Replace the placeholder secret with a freshly generated one.
  if grep -q '^JWT_SECRET=' "$APP_DIR/.env"; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" "$APP_DIR/.env"
  else
    printf '\nJWT_SECRET=%s\n' "$SECRET" >> "$APP_DIR/.env"
  fi
  # Persistence on by default: without it every restart erases the orders.
  sed -i 's|^PERSIST_DATA=.*|PERSIST_DATA=true|' "$APP_DIR/.env" 2>/dev/null || printf 'PERSIST_DATA=true\n' >> "$APP_DIR/.env"

  # Owner account (ADR-024). Production refuses to start without it, because the
  # alternative is a shop whose only admin is a demo login published on GitHub.
  # The password is generated here and printed exactly once.
  ADMIN_EMAIL_VALUE="${ADMIN_EMAIL:-owner@${DOMAIN:-manto.local}}"
  ADMIN_PASSWORD_VALUE="${ADMIN_PASSWORD:-$(head -c 24 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-16)}"
  {
    printf '\n# حساب مدیر فروشگاه — همین‌ها را برای ورود به پنل استفاده کن\n'
    printf 'ADMIN_EMAIL=%s\n' "$ADMIN_EMAIL_VALUE"
    printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD_VALUE"
    printf 'ADMIN_NAME=%s\n' "${ADMIN_NAME:-مدیر فروشگاه}"
  } >> "$APP_DIR/.env"

  ok "فایل .env ساخته شد: JWT_SECRET تصادفی + حساب مدیر فروشگاه"
else
  ok "فایل .env از قبل وجود دارد (دست‌نخورده ماند)"
fi

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

if [ -n "$DOMAIN" ]; then
  BASE="https://${DOMAIN}"
  sed -i "s|^PAYMENT_CALLBACK_BASE_URL=.*|PAYMENT_CALLBACK_BASE_URL=${BASE}|" "$APP_DIR/.env" 2>/dev/null || printf '\nPAYMENT_CALLBACK_BASE_URL=%s\n' "$BASE" >> "$APP_DIR/.env"
  sed -i "s|^PUBLIC_SITE_URL=.*|PUBLIC_SITE_URL=${BASE}|" "$APP_DIR/.env" 2>/dev/null || printf 'PUBLIC_SITE_URL=%s\n' "$BASE" >> "$APP_DIR/.env"
  ok "آدرس عمومی و آدرس بازگشت درگاه روی ${BASE} تنظیم شد"
else
  note "دامنه‌ای داده نشد — فروشگاه روی http://IP:3000 بالا می‌آید. برای دامنه: DOMAIN=example.com را دوباره اجرا کنید"
fi

say "ساخت و اجرای فروشگاه"
cd "$APP_DIR"
docker compose up -d --build
note "منتظر بالا آمدن سرویس…"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    ok "فروشگاه بالا آمد و به درخواست سلامت پاسخ می‌دهد"
    break
  fi
  sleep 2
done
curl -fsS --max-time 2 "http://127.0.0.1:3000/api/health" >/dev/null 2>&1 \
  || die "سرویس بالا نیامد. لاگ را ببینید: cd $APP_DIR && docker compose logs --tail=60"

if [ -n "$DOMAIN" ]; then
  say "نصب Nginx و گواهی HTTPS رایگان"
  apt-get install -y -qq nginx certbot python3-certbot-nginx >/dev/null

  # A dedicated site file keeps the default Nginx page from interfering.
  sed -e "s|YOUR_DOMAIN|${DOMAIN}|g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/mantomoda
  ln -sf /etc/nginx/sites-available/mantomoda /etc/nginx/sites-enabled/mantomoda
  rm -f /etc/nginx/sites-enabled/default

  # The certificate must exist before Nginx can load an ssl_server block, so the
  # first pass uses a plain HTTP config and certbot rewrites it from there.
  cat > /etc/nginx/sites-available/mantomoda <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 6M;
    }
}
NGINX
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  ok "Nginx روی HTTP تنظیم شد"

  if certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
       --register-unsafely-without-email --redirect >/dev/null 2>&1; then
    ok "گواهی HTTPS نصب شد و HTTP به HTTPS هدایت می‌شود"
  else
    note "دریافت گواهی انجام نشد. معمولاً یعنی DNS دامنه هنوز به این سرور اشاره نمی‌کند."
    note "بعد از اصلاح DNS این دستور را اجرا کنید:"
    note "  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect"
  fi
fi

say "زمان‌بندی پشتیبان‌گیری روزانه"
CRON_LINE="30 3 * * * cd ${APP_DIR} && DATA_DIR=${APP_DIR}/data BACKUP_DIR=${APP_DIR}/backups bash scripts/backup.sh --keep 30 >> ${APP_DIR}/logs/backup.log 2>&1"
if crontab -l -u "$APP_USER" 2>/dev/null | grep -q "scripts/backup.sh"; then
  ok "پشتیبان‌گیری از قبل زمان‌بندی شده است"
else
  (crontab -l -u "$APP_USER" 2>/dev/null; echo "$CRON_LINE") | crontab -u "$APP_USER" -
  ok "پشتیبان‌گیری روزانه ساعت ۳:۳۰ بامداد تنظیم شد (۳۰ نسخه نگه داشته می‌شود)"
fi

say "بررسی پیش از انتشار"
PERSIST_DATA=true DATA_DIR="$APP_DIR/data" UPLOAD_DIR="$APP_DIR/data/uploads" \
  bash "$APP_DIR/scripts/preflight.sh" || true

cat <<SUMMARY

==============================================
 ✅ نصب تمام شد
==============================================
 آدرس فروشگاه: ${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000}
 پنل مدیریت:   ${DOMAIN:+https://$DOMAIN/}${DOMAIN:-http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000/}

 ⚠ ورود به پنل مدیریت (این رمز فقط همین یک بار نمایش داده می‌شود — یادداشتش کن):
     ایمیل: ${ADMIN_EMAIL_VALUE:-$(grep -h '^ADMIN_EMAIL=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2)}
     رمز:   ${ADMIN_PASSWORD_VALUE:-$(grep -h '^ADMIN_PASSWORD=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2)}
   (این دو مقدار در $APP_DIR/.env ذخیره شده‌اند؛ برای تغییر رمز، همان فایل را ویرایش کن
    و بعد: cd $APP_DIR && docker compose restart manto — اگر رمز را عوض کنی، رمز جدید اعمال می‌شود.)

 دستورهای روزمره:
   دیدن وضعیت:    cd $APP_DIR && docker compose ps
   دیدن لاگ:      cd $APP_DIR && docker compose logs -f --tail=100 manto
   راه‌اندازی مجدد: cd $APP_DIR && docker compose restart manto
   به‌روزرسانی کد: cd $APP_DIR && docker compose up -d --build
   پشتیبان دستی:  cd $APP_DIR && bash scripts/backup.sh
   بررسی سلامت:   cd $APP_DIR && bash scripts/preflight.sh

 کارهای باقی‌مانده (فقط تصمیم تجاری):
   ۱. در پنل → تنظیمات فروشگاه: تعرفه ارسال واقعی و موبایل خودت را وارد کن
      (تا پیامک هشدار کم‌موجودی برایت بیاید)
   ۲. کلید درگاه پرداخت و پیامک را در $APP_DIR/.env بگذار و بعد
      docker compose restart manto را اجرا کن
   ۳. یک خرید آزمایشی واقعی انجام بده و مطمئن شو پیامک و فاکتور درست می‌آیند
==============================================
SUMMARY
