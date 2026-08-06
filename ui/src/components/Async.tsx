import type { ReactNode } from "react";
import type { AsyncState } from "../lib/useAsync";

interface AsyncProps<T> {
  state: AsyncState<T>;

  error: (message: string, reload: () => void) => ReactNode;
  loading?: ReactNode;

  children: (data: T, meta: { refreshing: boolean }) => ReactNode;
}

export function Async<T>({ state, error, loading = null, children }: AsyncProps<T>) {
  if (state.status === "error") {
    return <>{error(state.error ?? "", state.reload)}</>;
  }

  if (state.hasData) {
    return <>{children(state.data as T, { refreshing: state.status === "loading" })}</>;
  }
  return <>{loading}</>;
}
