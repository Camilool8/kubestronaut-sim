// Platform detection, for the two places the UI has to say something
// different on a Mac.
//
// The exam desktop is Linux and its terminal copies with Ctrl+Shift+C.
// The candidate's hands are on whatever keyboard they own. Until now the
// UI simply asserted "Ctrl+Shift+V" everywhere, which is right for a PC
// and wrong-in-a-confusing-way for a Mac user whose ⌘V does nothing
// visible at all (noVNC forwards ⌘ as Super, which this XFCE session
// binds to nothing).

/**
 * True on macOS. Uses navigator.platform, which is deprecated but still
 * the most reliable signal here: userAgentData.platform is Chromium-only,
 * and the UA string's "Mac OS X" also appears on iPadOS, which cannot run
 * this screen anyway (DesktopRequired gates it).
 */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  if (platform) return /^Mac/i.test(platform);
  return /Mac OS X/i.test(navigator.userAgent || "");
}

/** The glyph for the primary modifier, for prose. */
export function modifierGlyph(): string {
  return isMac() ? "⌘" : "Ctrl";
}
