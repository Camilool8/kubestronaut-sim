import { describe, expect, test } from "vitest";
import { isRtl, languageName, textDirection } from "./language";

describe("language helpers", () => {
  test("names come from the table, and fall back to the code", () => {
    expect(languageName("pt")).toBe("Português");
    expect(languageName("pt-BR")).toBe("Português");
    expect(languageName("xx")).toBe("xx");
  });

  test("right-to-left scripts set dir, everything else only lang", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(textDirection("ar")).toEqual({ lang: "ar", dir: "rtl" });
    expect(textDirection("pt")).toEqual({ lang: "pt" });
    expect(textDirection(undefined)).toEqual({});
  });
});
