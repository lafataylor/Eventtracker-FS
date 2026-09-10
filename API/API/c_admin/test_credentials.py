"""The scraper's own login must come from the environment, not the repo.

c_admin/constants.py is a tracked file in a PUBLIC repository and carried a
working site admin email and password, which the nightly scraper uses to log
itself in (scraper.get_headers). Owner request 2026-09-10: no admin
credentials stored in the repo.

Two things these tests pin, because both failure modes are silent:

* reading the values from the environment at CALL time, not import time - a
  module-level raise would break every manage.py command and the test suite
  the moment the variable is absent, which is exactly how OPENAI_API_KEY
  once made unrelated commands die with an opaque error;
* failing LOUDLY when they are missing. get_headers() swallows every
  exception and returns [], so an unset variable would otherwise look
  identical to a healthy run that simply found no accounts, and ingestion
  would stop with nothing in the log saying why.
"""
import os
from unittest import mock

from django.test import SimpleTestCase

from .constants import admin_credentials
from .scraper import get_headers


class AdminCredentialsTests(SimpleTestCase):
    def test_values_come_from_the_environment(self):
        with mock.patch.dict(os.environ, {'ADMIN_EMAIL': 'ops@example.com',
                                          'ADMIN_PASSWORD': 'from-env'}):
            self.assertEqual(admin_credentials(),
                             ('ops@example.com', 'from-env'))

    def test_they_are_read_at_call_time_not_import_time(self):
        # The module must import cleanly with nothing set, or every
        # manage.py command dies on an unrelated concern.
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                admin_credentials()

    def test_a_missing_variable_names_itself(self):
        with mock.patch.dict(os.environ, {'ADMIN_EMAIL': 'ops@example.com'},
                             clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                admin_credentials()
        self.assertIn('ADMIN_PASSWORD', str(ctx.exception))

    def test_an_empty_string_counts_as_missing(self):
        with mock.patch.dict(os.environ, {'ADMIN_EMAIL': '',
                                          'ADMIN_PASSWORD': 'x'}, clear=True):
            with self.assertRaises(RuntimeError):
                admin_credentials()

    def test_no_credential_is_hardcoded_in_the_tracked_module(self):
        """The regression guard: catches anyone pasting a value back in."""
        from . import constants
        with open(constants.__file__, encoding='utf-8') as fh:
            source = fh.read()
        for needle in ('dummy_@gmail.com', 'ADMIN_PASSWORD = "',
                       "ADMIN_PASSWORD = '"):
            self.assertNotIn(needle, source,
                             f'{needle!r} is back in constants.py')


class GetHeadersFailsLoudlyTests(SimpleTestCase):
    def test_missing_credentials_raise_rather_than_return_empty(self):
        # get_headers swallows exceptions and returns []; an unset variable
        # must not be mistaken for "logged in, found nothing".
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                get_headers()
