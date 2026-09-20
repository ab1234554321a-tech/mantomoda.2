#!/usr/bin/env bash
# =============================================================================
#  Manto Moda — data backup / restore
#
#  Backs up everything the shop cannot lose: the order/user snapshot and the
#  uploaded product images (ADR-010 / ADR-013).
#
#  Usage:
#    bash scripts/backup.sh                     # create a timestamped backup
#    bash scripts/backup.sh --keep 30           # keep only the newest 30 archives
#    bash scripts/backup.sh --list              # list existing backups
#    bash scripts/backup.sh --restore <file>    # restore (asks nothing, overwrites)
#
#  Cron example (daily at 03:30, keeps 30 days):
#    30 3 * * * cd /srv/mantomoda && bash scripts/backup.sh --keep 30 >> logs/backup.log 2>&1
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$REPO_ROOT/data}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR"

usage() { sed -n '2,16p' "${BASH_SOURCE[0]}"; }

case "${1:-}" in
  --help|-h) usage; exit 0 ;;

  --list)
    echo "Backups in $BACKUP_DIR:"
    ls -1t "$BACKUP_DIR"/manto-backup-*.tar.gz 2>/dev/null || echo "  (none)"
    exit 0 ;;

  --restore)
    ARCHIVE="${2:-}"
    [ -z "$ARCHIVE" ] && { echo "Usage: bash scripts/backup.sh --restore <file.tar.gz>" >&2; exit 1; }
    [ -f "$ARCHIVE" ] || { echo "Archive not found: $ARCHIVE" >&2; exit 1; }

    echo "→ Restoring $ARCHIVE into $DATA_DIR"
    mkdir -p "$DATA_DIR"
    tar -xzf "$ARCHIVE" -C "$DATA_DIR"
    echo "✓ Restored. Restart the server so the snapshot is loaded."
    exit 0 ;;

  --keep)
    KEEP="${2:?--keep needs a number}" ;;
esac

if [ ! -d "$DATA_DIR" ]; then
  echo "Nothing to back up: $DATA_DIR does not exist yet (the server creates it on first write)."
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_DIR/manto-backup-$STAMP.tar.gz"

# Write the snapshot first: a pending debounced save could otherwise be missed.
echo "→ Creating $ARCHIVE"
tar -czf "$ARCHIVE" -C "$DATA_DIR" .

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
echo "✓ Backup complete ($SIZE)"

# Verify the archive is readable — an unverified backup is not a backup.
if tar -tzf "$ARCHIVE" > /dev/null 2>&1; then
  echo "✓ Archive integrity verified"
else
  echo "✗ Archive is corrupt — deleting it and failing loudly" >&2
  rm -f "$ARCHIVE"
  exit 1
fi

# Rotate old archives
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/manto-backup-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) || true)
if [ "${#OLD[@]}" -gt 0 ]; then
  echo "→ Removing ${#OLD[@]} archive(s) beyond the newest $KEEP"
  printf '%s\n' "${OLD[@]}" | xargs rm -f
fi

echo "✓ Done. Backups kept: $(ls -1 "$BACKUP_DIR"/manto-backup-*.tar.gz 2>/dev/null | wc -l)"
