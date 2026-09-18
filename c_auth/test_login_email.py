"""An email address is not case-sensitive, and neither is logging in with one.

Found in the 2026-09-18 end-to-end pass: the owner typed his address with a
capital first letter (phones capitalise it), the account is stored lowercase,
and the lookup was an exact match, so the owner's own login would have
answered "user not found".
"""
from django.test import TestCase

from .models import User


class LoginEmailTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(email='owner@example.com', usertype='admin')
        self.admin.set_password('right'); self.admin.save()
        self.visitor = User.objects.create(email='visitor@example.com', usertype='regular')
        self.visitor.set_password('right'); self.visitor.save()

    def _post(self, path, email, password='right'):
        return self.client.post(path, {'email': email, 'password': password},
                                content_type='application/json')

    def test_admin_login_ignores_the_case_of_the_email(self):
        res = self._post('/v1/auth/login/', 'Owner@Example.com')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn('jwtToken', res.json())

    def test_admin_login_ignores_stray_spaces(self):
        self.assertEqual(self._post('/v1/auth/login/', ' owner@example.com ').status_code, 200)

    def test_visitor_login_ignores_the_case_of_the_email(self):
        res = self._post('/v1/auth/userLogin/', 'VISITOR@example.com')
        self.assertEqual(res.status_code, 200, res.content)

    def test_the_password_is_still_exact(self):
        self.assertNotEqual(self._post('/v1/auth/login/', 'owner@example.com', 'RIGHT').status_code, 200)

    def test_a_different_address_is_still_a_different_user(self):
        self.assertNotEqual(self._post('/v1/auth/login/', 'owner2@example.com').status_code, 200)


class CaseVariantAccountsTests(TestCase):
    """Review of PR #8: SQLite's unique index is case-sensitive, so two
    accounts can differ only by case, and a case-insensitive lookup with no
    ordering could check the password against the wrong one. Production had
    none on 2026-09-18 (31 users, all stored lowercase); these keep it so."""

    def _make(self, email, password, usertype='regular'):
        u = User.objects.create(email=email, usertype=usertype)
        u.set_password(password); u.save()
        return u

    def _login(self, email, password, path='/v1/auth/userLogin/'):
        return self.client.post(path, {'email': email, 'password': password},
                                content_type='application/json')

    def test_the_address_exactly_as_typed_wins(self):
        self._make('ana@example.com', 'lower-pass')
        self._make('Ana@example.com', 'upper-pass')
        self.assertEqual(self._login('Ana@example.com', 'upper-pass').status_code, 200)
        self.assertEqual(self._login('ana@example.com', 'lower-pass').status_code, 200)

    def test_an_ambiguous_casing_resolves_to_the_oldest_account_every_time(self):
        self._make('ana@example.com', 'first-pass')
        self._make('Ana@example.com', 'second-pass')
        for _ in range(3):
            self.assertEqual(self._login('ANA@example.com', 'first-pass').status_code, 200)

    def test_a_new_visitor_account_is_stored_lowercase(self):
        res = self.client.post('/v1/auth/userRegister/',
                               {'email': ' New.Visitor@Example.com ', 'password': 'pw-12345'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(User.objects.filter(email='new.visitor@example.com').exists())
