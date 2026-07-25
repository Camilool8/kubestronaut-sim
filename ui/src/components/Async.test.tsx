import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Async } from "./Async";
import type { AsyncState } from "../lib/useAsync";

const state = <T,>(over: Partial<AsyncState<T>>): AsyncState<T> => ({
  status: "idle",
  data: null,
  error: null,
  reload: () => {},
  ...over,
});

describe("Async", () => {
  test("renders the error branch when the call failed", () => {
    render(
      <Async
        state={state<string>({ status: "error", error: "HTTP 502" })}
        error={(message) => <p>failed: {message}</p>}
      >
        {(data) => <p>{data}</p>}
      </Async>,
    );
    expect(screen.getByText("failed: HTTP 502")).toBeInTheDocument();
  });

  test("renders children once data has arrived", () => {
    render(
      <Async
        state={state({ status: "success", data: "hello" })}
        error={(message) => <p>{message}</p>}
      >
        {(data) => <p>{data}</p>}
      </Async>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  test("keeps showing data while a reload is in flight", () => {
    render(
      <Async
        state={state({ status: "loading", data: "stale" })}
        error={(message) => <p>{message}</p>}
        loading={<p>spinner</p>}
      >
        {(data) => <p>{data}</p>}
      </Async>,
    );
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.queryByText("spinner")).not.toBeInTheDocument();
  });
});
