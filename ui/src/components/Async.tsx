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
  children: (data: T) => ReactNode;
}

export function Async<T>({ state, error, loading = null, children }: AsyncProps<T>) {
  if (state.status === "error") {
    return <>{error(state.error ?? "", state.reload)}</>;
  }
  // Data survives a reload, so refreshing never blanks a working screen.
  if (state.data !== null) {
    return <>{children(state.data)}</>;
  }
  return <>{loading}</>;
}
