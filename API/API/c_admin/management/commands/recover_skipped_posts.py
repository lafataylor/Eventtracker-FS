"""Re-open the scrape window for posts the extractor never processed.

Why this exists: on the nights of 2026-09-03 and 2026-09-04 the OpenAI account
ran out of credits. The scraper still fetched every account's new posts, but
extraction failed with ``insufficient_quota`` for 121 + 218 of them. When ALL
of an account's posts fail the structured path deliberately leaves
``LastRun`` alone, so the next healthy night retries them. When only SOME
fail, the account's ``last_run`` advances past the failed posts and they are
never fetched again: ``process_post`` drops anything older than
``last_fetched``. Those posts are lost unless ``last_run`` is moved back.

This command moves it back, and nothing else. The next scraper run re-fetches
the posts (Apify returns the latest few per account anyway), re-extracts
them, and upserts by ``source_key`` so posts that DID succeed on those nights
are updated in place rather than duplicated.

Default is a dry run. Default selection is narrow: only accounts that (a)
have a ``[STRUCTURED] <shortcode> failed: ... insufficient_quota`` line
attributed to them in the Logs table since ``--since`` AND (b) whose
``last_run`` advanced past ``--since``. ``--all-advanced`` widens (a) away,
which costs one extra extraction per already-processed post.

    manage.py recover_skipped_posts --since "2026-09-03 21:00" \
        --reset-to "2026-09-02 21:00"            # dry run, prints the plan
    manage.py recover_skipped_posts --since ... --reset-to ... --apply
"""
import re
from datetime import datetime, timezone as dt_timezone

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from c_admin.models import LastRun, Logs

# The structured path logs one header line per account, then one line per
# post. Accounts are processed one after another, so a failure line belongs
# to the most recent header before it (ordered by row id within a run).
ACCOUNT_HEADER = re.compile(r"^\[STRUCTURED\] (\S+): \d+ images -> \d+ posts")
POST_FAILED = re.compile(r"^\[STRUCTURED\] (\S+) failed:")
QUOTA_MARKERS = ("insufficient_quota", "no credits remaining", "credit_balance_exhausted")

# Same idle rule as purge_past_events: the scraper logs a row per step, so a
# row younger than this means a run is in flight and LastRun must not move.
PIPELINE_IDLE_MINUTES = 15
LOG_TS_FORMAT = "%Y-%m-%d %H:%M:%S"


def parse_utc(value):
    """'2026-09-03 21:00' or '2026-09-03 21:00:00' -> aware UTC datetime."""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=dt_timezone.utc)
        except ValueError:
            continue
    raise CommandError(f"cannot parse {value!r}; use 'YYYY-MM-DD HH:MM' (UTC)")


def accounts_with_quota_failures(since):
    """{account: number of posts that failed on credits} from the Logs table."""
    rows = (Logs.objects.filter(scraped_at__gte=since.strftime(LOG_TS_FORMAT),
                                message__startswith="[STRUCTURED]")
            .order_by("id").values_list("message", flat=True).iterator())
    failures = {}
    current = None
    for message in rows:
        header = ACCOUNT_HEADER.match(message)
        if header:
            current = header.group(1)
            continue
        failed = POST_FAILED.match(message)
        if failed and current and any(m in message for m in QUOTA_MARKERS):
            failures[current] = failures.get(current, 0) + 1
    return failures


class Command(BaseCommand):
    help = "Move LastRun back for accounts whose posts were skipped by a failed extraction night."

    def add_arguments(self, parser):
        parser.add_argument("--since", required=True,
                            help="UTC start of the first failed night, e.g. '2026-09-03 21:00'")
        parser.add_argument("--reset-to", required=True,
                            help="UTC instant to move last_run back to (before the failed posts were published)")
        parser.add_argument("--all-advanced", action="store_true",
                            help="select every account whose last_run advanced since --since, "
                                 "not only those with a logged quota failure")
        parser.add_argument("--apply", action="store_true", help="write; default is a dry run")

    def handle(self, *args, **opts):
        since = parse_utc(opts["since"])
        reset_to = parse_utc(opts["reset_to"])
        if reset_to >= since:
            raise CommandError("--reset-to must be earlier than --since")
        if opts["apply"]:
            self._require_pipeline_idle()

        since_epoch = since.timestamp()
        advanced = {}
        for row in LastRun.objects.exclude(last_run__isnull=True):
            try:
                epoch = float(row.last_run)
            except (TypeError, ValueError):
                continue
            if epoch >= since_epoch:
                advanced[row.account] = row

        failures = accounts_with_quota_failures(since)
        if opts["all_advanced"]:
            selected = sorted(advanced)
        else:
            selected = sorted(a for a in advanced if a in failures)

        mode = "APPLY" if opts["apply"] else "DRY RUN"
        self.stdout.write(f"{mode}: {len(advanced)} accounts advanced since {since:%Y-%m-%d %H:%M} UTC; "
                          f"{len(failures)} accounts have quota failures logged; "
                          f"{len(selected)} selected -> last_run = {reset_to:%Y-%m-%d %H:%M} UTC")
        for account in selected:
            self.stdout.write(f"  {account}: {failures.get(account, 0)} failed post(s)")
        if not opts["apply"]:
            self.stdout.write("no writes (add --apply)")
            return

        new_value = str(float(reset_to.timestamp()))
        with transaction.atomic():
            for account in selected:
                row = advanced[account]
                row.last_run = new_value
                row.save(update_fields=["last_run"])
        self.stdout.write(f"updated {len(selected)} LastRun rows")

    def _require_pipeline_idle(self):
        newest = Logs.objects.order_by("-id").values_list("scraped_at", flat=True).first()
        if not newest:
            return
        try:
            stamped = datetime.strptime(newest, LOG_TS_FORMAT).replace(tzinfo=dt_timezone.utc)
        except (TypeError, ValueError):
            raise CommandError(f"newest Logs timestamp {newest!r} is unparsable; refusing to guess")
        age_minutes = (timezone.now() - stamped).total_seconds() / 60
        if age_minutes < PIPELINE_IDLE_MINUTES:
            raise CommandError(f"pipeline wrote a log row {age_minutes:.0f} min ago; "
                               f"refusing to move LastRun under a running scrape")
