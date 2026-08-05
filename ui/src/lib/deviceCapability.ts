/**
 * What kind of pointer this device actually has, and how that fact
 * reaches the server.
 *
 * The *rule* about which exams a device may start lives on the server,
 * in both Go services. The *input* to that rule cannot: no server can
 * measure a pointer, and a User-Agent is a string a browser is free to
 * lie about — desktop-mode on a phone would walk straight through one,
 * and some laptops would be turned away by it. So the client reports
 * what it measured and the server decides what to do about it.
 *
 * That is the inverse of the mode capability rows, where the server owns
 * the predicate and the client only renders it. The inversion is
 * deliberate and has exactly one cause: this is the one fact the server
 * has no way to observe.
 *
 * React-free on purpose. `api.ts` needs this on every request and has no
 * business importing a hook to get it.
 */

/**
 * No precise pointer available anywhere — a phone or tablet, as opposed
 * to a touchscreen laptop, which reports both.
 *
 * `any-pointer` rather than `pointer` is deliberate: `pointer` reports
 * only the *primary* input, so a touchscreen laptop would look like a
 * phone. And the check for the absence of `fine` is what keeps a
 * low-vision desktop user out of the gate — WCAG 1.4.10 defines 320 CSS
 * px as equivalent to a 1280px window at 400% zoom, so a width-only
 * test would lock out exactly the people who most need the zoom.
 */
export const TOUCH_ONLY_QUERY = "(any-pointer: coarse) and (not (any-pointer: fine))";

/** The wire name. Mirrored in both Go services; see docs/api.md. */
export const POINTER_HEADER = "X-Sim-Pointer";

export type PointerClass = "coarse" | "fine";

/**
 * Undefined means "this client could not tell", and is reported as an
 * absent header rather than as a guess.
 *
 * Guessing either way would be worse than saying nothing. "fine" would
 * be indistinguishable from a measured desktop, and "coarse" would lock
 * a desktop out of the product on the strength of a missing API.
 */
export function pointerClass(): PointerClass | undefined {
  if (typeof matchMedia !== "function") return undefined;
  try {
    return matchMedia(TOUCH_ONLY_QUERY).matches ? "coarse" : "fine";
  } catch {
    return undefined;
  }
}

/** Spreadable into a fetch init, empty when the device could not be read. */
export function pointerHeader(): Record<string, string> {
  const pointer = pointerClass();
  return pointer ? { [POINTER_HEADER]: pointer } : {};
}
