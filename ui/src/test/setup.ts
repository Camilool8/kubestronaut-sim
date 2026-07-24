import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest runs without injected globals, so testing-library's automatic
// per-test cleanup never registers itself; do it explicitly.
afterEach(cleanup);
