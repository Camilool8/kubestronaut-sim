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
    return !NON_TYPING_INPUT_TYPES.has(field.type);
  }

  if (field.isContentEditable === false && field.tagName !== "TEXTAREA") return false;
  return true;
}
