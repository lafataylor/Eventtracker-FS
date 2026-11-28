"""Is a scrape run live, and clearing runs that died without saying so.

A run opens with an "In Progress" Logs row and closes it in
log_overall_completion. If the process running it dies first (gunicorn's
WORKER TIMEOUT killed one on 2026-11-08 00:08 UTC), the row stays open for
ever and cronRun.py refuses every later night with "A run is already in
progress": no scrape from 2026-11-07 to 2026-11-28.

The pipeline writes a Logs row at every step, so a run that has written
nothing for STALE_AFTER is dead. reap_stale_runs() marks its open row Failed
(never deletes it). A timestamp that does not parse is left alone rather than
guessed at.

STALE_AFTER is 100 minutes: about 3x the worst normal intra-run gap between
consecutive Logs rows (32.6 minutes in execution 380 on 2026-05-03), rounded
up, with a 15-minute floor. Multi-day gaps in older rows were outliers from
mis-associated Completed markers, not a live pause. Killed runs 557 and 558
had no long internal gap (1.6 minutes and 38 seconds).
"""
from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone

from .models import Logs

IN_PROGRESS = "In Progress"
FAILED = "Failed"
STALE_AFTER = timedelta(minutes=100)
LOG_TS_FORMAT = "%Y-%m-%d %H:%M:%S"
# Same window read_logs uses: a live run is among the newest rows.
IN_PROGRESS_LOOKBACK = 50000


def _parse(stamp):
    try:
        return datetime.strptime((stamp or "").strip(), LOG_TS_FORMAT)
    except ValueError:
        return None


def _now_utc_naive():
    return timezone.now().astimezone(dt_timezone.utc).replace(tzinfo=None)


def open_runs():
    newest_id = Logs.objects.order_by("-id").values_list("id", flat=True).first() or 0
    return Logs.objects.filter(id__gt=newest_id - IN_PROGRESS_LOOKBACK, status=IN_PROGRESS)


def reap_stale_runs(stale_after=STALE_AFTER):
    """Mark open runs with no log activity for `stale_after` as Failed.

    Returns the ids it closed.
    """
    newest = Logs.objects.order_by("-id").values_list("scraped_at", flat=True).first()
    last_activity = _parse(newest)
    if last_activity is None:
        return []
    cutoff = _now_utc_naive() - stale_after
    if last_activity > cutoff:
        return []  # something wrote recently: a run is alive
    reaped = []
    for row in open_runs():
        started = _parse(row.scraped_at)
        if started is None or started > cutoff:
            continue
        updated = Logs.objects.filter(id=row.id, status=IN_PROGRESS).update(
            status=FAILED,
            message=((row.message or "") + " [reaped: no log activity since "
                     + last_activity.strftime(LOG_TS_FORMAT) + " UTC]").strip(),
        )
        if updated:
            reaped.append(row.id)
    return reaped


def live_run_exists():
    """True if a run is in progress after stale runs have been cleared."""
    reap_stale_runs()
    return open_runs().exists()
