/**
 * Is a keystroke aimed at a form control rather than at the city?
 *
 * Every key handler skipped any focused INPUT, and a checkbox or slider keeps
 * focus after it is clicked - so ticking "Footsteps" in the help panel left H
 * unable to close the panel and WASD unable to walk until something else was
 * clicked (#12). Only controls that take typed text, or that eat arrow keys
 * for their own options, own the keyboard.
 */
const NOT_TYPED = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color']);

/** @param {EventTarget|null} t a key event's target */
export function isTyping(t) {
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return true;
  if (t.tagName === 'INPUT') return !NOT_TYPED.has(String(t.type).toLowerCase());
  return false;
}
