import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Async } from "./Async";
import type { AsyncState } from "../lib/useAsync";

const state = <T,>(over: Partial<AsyncState<T>>): AsyncState<T> => ({
  status: "idle",
  data: null,
  hasData: false,
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
        state={state({ status: "success", data: "hello", hasData: true })}
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
        state={state({ status: "loading", data: "stale", hasData: true })}
        error={(message) => <p>{message}</p>}
        loading={<p>spinner</p>}
      >
        {(data) => <p>{data}</p>}
      </Async>,
    );
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.queryByText("spinner")).not.toBeInTheDocument();
  });

  // A call that resolves with nothing is still a call that resolved. Gating
  // on `data !== null` reported a useAsync<void> as perpetually loading.
  test("a call that resolves with no value still counts as loaded", () => {
    render(
      <Async
        state={state<void>({ status: "success", hasData: true })}
        error={(message) => <p>{message}</p>}
        loading={<p>spinner</p>}
      >
        {() => <p>done</p>}
      </Async>,
    );
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.queryByText("spinner")).not.toBeInTheDocument();
  });

  // A refetch over data already on screen is otherwise invisible: the
  // screen keeps rendering values that may already be wrong.
  test("children are told when a refresh is in flight over stale data", () => {
    render(
      <Async
        state={state({ status: "loading", data: "stale", hasData: true })}
        error={(message) => <p>{message}</p>}
      >
        {(data, meta) => <p>{meta.refreshing ? `${data} (updating)` : data}</p>}
      </Async>,
    );
    expect(screen.getByText("stale (updating)")).toBeInTheDocument();
  });
});
