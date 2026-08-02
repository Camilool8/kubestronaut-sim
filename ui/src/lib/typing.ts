/**
 * Whether a keystroke landed somewhere the candidate is composing text,
 * and so must not be stolen for a single-letter shortcut.
 *
 * The obvious spelling of this — `closest("input, textarea,
 * [contenteditable]")` — is wrong in one specific and expensive way: an
 * mcq option IS an `<input type="checkbox">`. Clicking an answer focuses
 * it, so every shortcut the exam advertises died on the most ordinary
 * action in the product. G stopped opening the navigator the moment you
 * used the screen for its purpose, and the footer sitting right there
 * still said "Navigator G".
 *
 * A checkbox, a radio or a button consumes no letters, so a letter
 * pressed over one is unambiguously a shortcut. Only fields that take
 * typed characters are a typing context, and that is what this asks.
 */
const NON_TYPING_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const field = target.closest<HTMLElement>("input, textarea, [contenteditable]");
  if (!field) return false;
  if (field instanceof HTMLInputElement) {
    // `type` normalizes to lowercase, and to "text" for an unknown or
    // absent value — which is the right default: an input this list does
    // not recognize is assumed to take characters.
    return !NON_TYPING_INPUT_TYPES.has(field.type);
  }
  // contenteditable="false" is an explicit opt OUT, and it nests: an
  // editable host can carry a non-editable island. isContentEditable
  // resolves the inherited value, where the attribute alone does not.
  if (field.isContentEditable === false && field.tagName !== "TEXTAREA") return false;
  return true;
}
