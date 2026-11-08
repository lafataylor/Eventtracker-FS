"""Apply pending AUTO_APPLY migrations with a verified backup.

Usage:
    manage.py safe_migrate --writers-fenced --backup-dir /home/ubuntu/dbBackups
"""
from django.core.management.base import BaseCommand, CommandError

from event.safe_migrate import run_safe_migrate


class Command(BaseCommand):
    help = ('Apply pending AUTO_APPLY migrations after a verified SQLite '
            'backup. Refuses automatic restore if newer rows appeared.')

    def add_arguments(self, parser):
        parser.add_argument(
            '--backup-dir', required=True,
            help='Where to write db.sqlite3.predeploy-* copies.')
        parser.add_argument(
            '--writers-fenced', action='store_true',
            help='Caller has stopped gunicorn and holds the db-maint lock.')
        parser.add_argument(
            '--plan-file', default='',
            help='Classify this migration file and stop (tests).')

    def handle(self, *args, **opts):
        plan_file = opts.get('plan_file') or None
        try:
            run_safe_migrate(
                backup_dir=opts['backup_dir'],
                writers_fenced=opts['writers_fenced'],
                plan_file=plan_file,
                stdout=self.stdout)
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(str(exc))
