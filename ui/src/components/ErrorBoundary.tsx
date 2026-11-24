import { Component, type ReactNode } from "react";
import { strings } from "../strings";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div className="error-boundary" role="alert">
          <h1>{strings.errorBoundary.title}</h1>
          <p className="error-text">{this.state.error.message}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            {strings.errorBoundary.reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface PaneFallbackProps {
  title: string;
  onRetry: () => void;
  children?: ReactNode;
}

export function PaneFallback({ title, onRetry, children }: PaneFallbackProps) {
  return (
    <div className="pane-fallback" role="alert">
      <p className="pane-fallback-title">{title}</p>
      <p className="pane-fallback-body">{strings.paneError.safe}</p>
      <div className="pane-fallback-actions">
        <button type="button" className="btn" onClick={onRetry}>
          {strings.paneError.retry}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => window.location.reload()}>
          {strings.paneError.reloadPage}
        </button>
      </div>
      {children}
    </div>
  );
}
