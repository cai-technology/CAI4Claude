#!/bin/bash
# CAI4Claude — Hourly sync + Prometheus export
# CAI Technology | ai.caitech.ro
#
# Install as cron job:
#   crontab -e
#   5 * * * * /home/admin365/bin/cai4claude-hourly.sh >> /var/log/cai4claude/hourly.log 2>&1

set -euo pipefail

export PATH="$HOME/.local/npm-global/bin:$PATH"

LOG_DIR=${LOG_DIR:-/var/log/cai4claude}
PROM_FILE=${PROM_FILE:-/var/lib/node_exporter/cai4claude.prom}

mkdir -p "$LOG_DIR" 2>/dev/null || true
mkdir -p "$(dirname "$PROM_FILE")" 2>/dev/null || true

echo "════════════════════════════════════════════════════"
echo "  CAI4Claude Hourly — $(date -Iseconds)"
echo "════════════════════════════════════════════════════"

# 1. Sync all configured hosts
echo "[1/3] Syncing hosts..."
cai4claude sync 2>&1 | tail -20

# 2. Emit Prometheus metrics for: today, week, month
echo ""
echo "[2/3] Exporting Prometheus metrics..."
for period in today week month; do
  TMP="${PROM_FILE}.${period}.tmp"
  cai4claude prometheus --period "$period" --output "$TMP" 2>&1 | tail -2
done

# Concatenate all periods into final prom file (atomic)
cat "${PROM_FILE}".*.tmp > "${PROM_FILE}.new" 2>/dev/null || true
mv -f "${PROM_FILE}.new" "$PROM_FILE"
rm -f "${PROM_FILE}".*.tmp

# 3. Quick status snapshot to log
echo ""
echo "[3/3] Current status:"
cai4claude status 2>&1

echo ""
echo "Done. Metrics: $PROM_FILE"
