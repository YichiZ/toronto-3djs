/**
 * Which focused elements own the keyboard (#12).
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTyping } from '../src/ui/typing.js';

const input = (type) => ({ tagName: 'INPUT', type });

test('text entry and dropdowns keep their keys', () => {
  for (const t of [input('text'), input('search'), input('number'), { tagName: 'SELECT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
    assert.equal(isTyping(t), true, JSON.stringify(t));
  }
});

test('a clicked checkbox, slider or button does not swallow WASD, H or Esc', () => {
  for (const type of ['checkbox', 'radio', 'range', 'button', 'CHECKBOX']) {
    assert.equal(isTyping(input(type)), false, type);
  }
});

test('the page itself, the canvas, and nothing are not typing', () => {
  assert.equal(isTyping(null), false);
  assert.equal(isTyping({ tagName: 'CANVAS' }), false);
  assert.equal(isTyping({ tagName: 'BODY' }), false);
});
