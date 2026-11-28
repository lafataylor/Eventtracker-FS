#!/bin/bash
# Nightly scrape, run by cron at 21:01 UTC (replaces run_cron.sh, 2026-11-28).
# Runs `manage.py run_scrape` in its own process, so restarting gunicorn no
# longer kills the scrape. Keys come from the gunicorn unit (see run_scrape.py).
API=/home/ubuntu/EventTracker-API/API
LOG=$API/logs/run_scrape.log
cd "$API" || exit 1
source /home/ubuntu/EventTracker-API/venv/bin/activate
{
  echo "=== $(date -u '+%Y-%m-%d %H:%M:%S') UTC run_scrape.sh start (pid $$)"
  flock -n 9 || { echo "another run_scrape.sh holds the lock; exiting"; exit 0; }
  python manage.py run_scrape "$@"
  rc=$?
  echo "=== $(date -u '+%Y-%m-%d %H:%M:%S') UTC run_scrape.sh exit $rc"
} 9>"$API/logs/run_scrape.lock" >> "$LOG" 2>&1
