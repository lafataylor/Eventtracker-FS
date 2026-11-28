"""Run one scrape in its own process: `manage.py run_scrape`.

Until 2026-11-28 the scrape ran as a thread inside a gunicorn web worker
(AdminRunScraper). A gunicorn restart or WORKER TIMEOUT killed it mid-run and
left its "In Progress" row open, which blocked every later night (stalled
2026-11-07 to 2026-11-28). Now cron runs this command directly (run_scrape.sh)
and the admin endpoint starts it as a detached process.

    manage.py run_scrape                    # every account, like cronRun.py
    manage.py run_scrape --exec-id 559 --accounts-file f.json   # from the endpoint
    manage.py run_scrape --reap-only        # just close dead "In Progress" rows

The run's "In Progress" row is closed Completed by the pipeline, or Failed here
if it raises or is sent SIGTERM. SIGKILL cannot be caught; the stale-run reaper
closes those after 100 minutes without log activity.
"""
import json
import os
import shlex
import signal
import subprocess

from django.core.management.base import BaseCommand, CommandError

from c_admin.models import Account, Logs
from c_admin.run_state import FAILED, IN_PROGRESS, live_run_exists, reap_stale_runs
from event.models import Execution

# The API keys live in the gunicorn unit's Environment= lines. Read them from
# there so cron runs get exactly what the web workers get, without a second
# copy of the secrets. As in gunicorn, they win over .env.local.


def load_service_env(unit="gunicorn"):
    try:
        out = subprocess.run(
            ["systemctl", "show", unit, "-p", "Environment", "--value"],
            capture_output=True, text=True, timeout=10, check=True).stdout
    except Exception:
        return
    for pair in shlex.split(out):
        key, sep, value = pair.partition("=")
        if sep and key:
            os.environ[key] = value


def _raise_on_sigterm(signum, frame):
    raise SystemExit("terminated by signal %d" % signum)


class Command(BaseCommand):
    help = "Run one scrape (or --reap-only) outside the web server."
    # The URL check imports views -> scraper, which needs OPENAI_API_KEY
    # before handle() has loaded it. `manage.py check` covers this at deploy.
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument("--exec-id", type=int, help="Execution row already created by the endpoint.")
        parser.add_argument("--accounts-file", help="JSON list of usernames (default: every Account).")
        parser.add_argument("--reap-only", action="store_true",
                            help="Close In Progress rows with no log activity for 100+ minutes, then exit.")

    def handle(self, *args, **opts):
        reaped = reap_stale_runs()
        if reaped:
            self.stdout.write("reaped stale In Progress rows: %s" % reaped)
        if opts["reap_only"]:
            return

        if live_run_exists():
            raise CommandError("A run is already in progress")

        load_service_env()
        if not os.environ.get("OPENAI_API_KEY"):
            raise CommandError("OPENAI_API_KEY is not set (gunicorn unit or environment)")

        # Imported here: scraper builds its OpenAI client at import time.
        from c_admin.scraper import clean_download_images, get_headers
        from c_admin.views import accounts_to_scrape

        if opts["accounts_file"]:
            with open(opts["accounts_file"]) as f:
                usernames = json.load(f)
        else:
            usernames = list(Account.objects.values_list("user", flat=True))
        accounts = accounts_to_scrape(usernames)
        if not accounts:
            raise CommandError("No accounts to scrape")

        exec_id = opts["exec_id"] or Execution.objects.create(status="200").id
        self.stdout.write("execution %s: %d accounts, pid %d" % (exec_id, len(accounts), os.getpid()))

        signal.signal(signal.SIGTERM, _raise_on_sigterm)
        try:
            clean_download_images(accounts=accounts, exec_id=exec_id, headers=get_headers())
        finally:
            # Completed runs replaced this row already; anything still open died.
            closed = Logs.objects.filter(execution_id=exec_id, status=IN_PROGRESS).update(status=FAILED)
            self.stdout.write("execution %s %s" % (exec_id, "FAILED" if closed else "finished"))
            if opts["accounts_file"]:
                try:
                    os.remove(opts["accounts_file"])
                except OSError:
                    pass
