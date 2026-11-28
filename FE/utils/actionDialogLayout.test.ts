// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionDialogBodyClass,
  actionDialogButtonClass,
  actionDialogButtonsRowClass,
  actionDialogMessageClass,
  actionDialogShellClass,
  actionDialogTitleClass,
} from './actionDialogLayout.ts';

test('dialog shell leaves side margin on phone and is 600px from sm', () => {
  const cls = actionDialogShellClass();
  assert.match(cls, /\bmx-3\b/);
  assert.match(cls, /\bsm:mx-auto\b/);
  assert.match(cls, /sm:w-\[600px]/);
  assert.match(cls, /\bmax-w-full\b/);
});

test('body padding is lighter on phone than the old px-12', () => {
  const cls = actionDialogBodyClass();
  assert.match(cls, /\bpx-4\b/);
  assert.match(cls, /\bsm:px-12\b/);
  assert.doesNotMatch(cls, /(?:^|\s)px-12(?:\s|$)/);
});

test('title and body wrap centered on narrow screens', () => {
  assert.match(actionDialogTitleClass(), /\btext-center\b/);
  assert.match(actionDialogMessageClass(), /\btext-center\b/);
  assert.match(actionDialogMessageClass(), /\btext-sm\b/);
});

test('buttons stack on phone and sit in a row from sm; no fixed w-40', () => {
  const row = actionDialogButtonsRowClass();
  assert.match(row, /\bflex-col-reverse\b/);
  assert.match(row, /\bsm:flex-row\b/);
  assert.match(row, /\bgap-3\b/);

  const btn = actionDialogButtonClass('delete');
  assert.match(btn, /\bflex-1\b/);
  assert.match(btn, /\bmin-w-0\b/);
  assert.match(btn, /\bbg-solid-red\b/);
  assert.doesNotMatch(btn, /\bw-40\b/);

  assert.match(actionDialogButtonClass('cancel'), /\bbg-black\b/);
  assert.match(actionDialogButtonClass('submit'), /\bbg-beaming-orange\b/);
});
