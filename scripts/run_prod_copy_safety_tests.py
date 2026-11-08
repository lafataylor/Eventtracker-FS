#!/usr/bin/env python3
"""Run the two production-copy backup/restore checks.

Pass a snapshot kept outside the live API tree. This process only reads
that snapshot, copies it to a temp dir, and writes the copy. Stdlib plus
the checkout's sqlite backup helpers. No app settings, no keys, no
network.

Usage:
  python3 scripts/run_prod_copy_safety_tests.py /path/to/prod-copy.sqlite3
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'API' / 'API'))

from event.prod_copy_safety import DEFAULT_LIVE_DB, run_all  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=(
            'Run backup/restore safety checks on a database snapshot. '
            'Writes only a temp copy; never the live file.'))
    parser.add_argument(
        'snapshot', nargs='?',
        help='Path to a verified snapshot (not the live database)')
    parser.add_argument(
        '--copy', dest='copy',
        help='Same as the snapshot argument')
    parser.add_argument(
        '--live-db', default=DEFAULT_LIVE_DB,
        help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    snapshot = args.copy or args.snapshot
    if not snapshot:
        sys.stderr.write('REFUSED: pass the snapshot path\n')
        return 2
    try:
        return run_all(snapshot, live_db=args.live_db)
    except SystemExit as exc:
        code = exc.code
        if isinstance(code, str):
            sys.stderr.write(code + '\n')
            return 1
        if code is None:
            return 0
        return code
    except Exception as exc:
        sys.stderr.write('FAIL: %s: %s\n' % (type(exc).__name__, exc))
        return 1


if __name__ == '__main__':
    sys.exit(main())
