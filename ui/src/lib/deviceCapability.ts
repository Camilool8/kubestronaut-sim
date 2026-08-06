export const TOUCH_ONLY_QUERY = "(any-pointer: coarse) and (not (any-pointer: fine))";

export const POINTER_HEADER = "X-Sim-Pointer";

export type PointerClass = "coarse" | "fine";

export function pointerClass(): PointerClass | undefined {
  if (typeof matchMedia !== "function") return undefined;
  try {
    return matchMedia(TOUCH_ONLY_QUERY).matches ? "coarse" : "fine";
  } catch {
    return undefined;
  }
}

export function pointerHeader(): Record<string, string> {
  const pointer = pointerClass();
  return pointer ? { [POINTER_HEADER]: pointer } : {};
}
