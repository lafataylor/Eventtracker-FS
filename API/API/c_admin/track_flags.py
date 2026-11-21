"""Per-account feed / stories tracking flags.

Replaces the hardcoded STORIES_SUBSET_ACCOUNTS / STORIES_SCRAPE_MODE that
lived in scraper.py. Manage Accounts toggles these; the scraper reads them.
"""

# The three accounts that were on the hardcoded stories subset before
# DB-backed flags. Seed migration turns stories on for these handles only.
FORMER_STORIES_SUBSET_ACCOUNTS = frozenset({
    'justineswinebar',
    'cafetondo',
    '10highdesign',
})


def effective_track_feed(value):
    """None (nullable pre-seed column) means feed on — the historical default."""
    if value is None:
        return True
    return bool(value)


def effective_track_stories(value):
    """None means stories off — matches the old subset-default of most accounts."""
    if value is None:
        return False
    return bool(value)


def seed_track_flags(Account):
    """Fill track_feed / track_stories after the nullable columns are added.

    Existing Manage Accounts rows keep feed on. The three former subset
    handles get stories on; everyone else stories off. 2026-11-20.
    """
    for account in Account.objects.all().iterator():
        account.track_feed = True
        handle = (account.user or '').strip().lower()
        account.track_stories = handle in FORMER_STORIES_SUBSET_ACCOUNTS
        account.save(update_fields=['track_feed', 'track_stories'])
