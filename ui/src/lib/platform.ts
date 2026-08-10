export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  if (platform) return /^Mac/i.test(platform);
  return /Mac OS X/i.test(navigator.userAgent || "");
}
