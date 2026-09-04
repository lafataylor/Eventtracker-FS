#!/bin/bash
# Nightly retention purge for lafaslist (owner-approved 2026-09-03: gone from
# sight after 1 day, deleted 30 days after the event; 90 days for undated and
# Jan-1 sentinel rows). Installed at /home/ubuntu/EventTracker-API/API/run_purge.sh
# and scheduled at 04:10 UTC - AFTER run_dedupe.sh (03:37) and long after the
# nightly scrape (21:01 -> ~01:45). Never co-schedule with either: the purge
# refuses while the pipeline wrote a log row in the last 15 minutes, and its
# pre-purge copy cannot finish under a steady writer.
#
# OPENAI_API_KEY: c_admin/scraper.py builds an OpenAI client at import, so every
# manage.py command needs SOME value; nothing here calls OpenAI.
cd /home/ubuntu/EventTracker-API/API || exit 1

LOG=/home/ubuntu/EventTracker-API/API/logs/purge.log
exec >> "$LOG" 2>&1
echo "===== $(date -u '+%Y-%m-%d %H:%M:%S') UTC purge starting ====="

OPENAI_API_KEY=not-used-by-this-command \
  /home/ubuntu/EventTracker-API/venv/bin/python manage.py purge_past_events \
  --apply --backup-dir /home/ubuntu/dbBackups 2>&1 \
  | grep -viE '^\s*$|warning'
# PIPESTATUS, not $?: $? here is grep's status (same bug run_dedupe.sh had).
STATUS=${PIPESTATUS[0]}
echo "exit=$STATUS"

# Keep this log bounded; it runs forever.
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 10485760 ]; then
    tail -c 2097152 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
exit $STATUS
