import { describe, expect, test } from "vitest";
import { ApiError, isEnvironmentStarting } from "./api";

describe("ApiError", () => {
  // Everything that renders one of these renders `${err}`, and the
  // toast copy is asserted elsewhere by its full text. Setting `name`
  // would silently reword every one of them.
  test("stringifies exactly as a plain Error does", () => {
    const err = new ApiError(503, "your exam environment is still starting", "environment_starting");
    expect(String(err)).toBe("Error: your exam environment is still starting");
  });

  test("keeps the parts a caller branches on", () => {
    const err = new ApiError(503, "still starting", "environment_starting");
    expect(err.status).toBe(503);
    expect(err.code).toBe("environment_starting");
    expect(err instanceof Error).toBe(true);
  });

  test("recognises the hub's Pod-replacement wait and nothing else", () => {
    expect(isEnvironmentStarting(new ApiError(503, "x", "environment_starting"))).toBe(true);
    expect(isEnvironmentStarting(new ApiError(502, "x", "environment_unreachable"))).toBe(false);
    expect(isEnvironmentStarting(new ApiError(500, "x"))).toBe(false);
    expect(isEnvironmentStarting(new Error("your exam environment is still starting"))).toBe(false);
  });
});
