import type { ReactNode } from "react";
import type { AsyncState } from "../lib/useAsync";

interface AsyncProps<T> {
  state: AsyncState<T>;
  /**
   * Required, deliberately. Milestone F exists because two screens
   * rendered nothing when a fetch failed — a 502 became an empty lobby and
   * a dead button. Making this prop mandatory turns that mistake into a
   * type error rather than something review has to catch.
   */
  error: (message: string, reload: () => void) => ReactNode;
  loading?: ReactNode;
  /**
   * `refreshing` is true when a call is in flight over data already on
   * screen. Without it a refetch is invisible: the screen keeps rendering
   * the previous, possibly stale, values with nothing saying so.
   */
  children: (data: T, meta: { refreshing: boolean }) => ReactNode;
}

export function Async<T>({ state, error, loading = null, children }: AsyncProps<T>) {
  if (state.status === "error") {
    return <>{error(state.error ?? "", state.reload)}</>;
  }
  // Data survives a reload, so refreshing never blanks a working screen.
  // Gated on hasData rather than `data !== null` so a call that resolves
  // with nothing still counts as loaded.
  if (state.hasData) {
    return <>{children(state.data as T, { refreshing: state.status === "loading" })}</>;
  }
  return <>{loading}</>;
}
