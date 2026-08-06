import { Component, type ReactNode } from "react";
import { strings } from "../strings";

interface ErrorBoundaryProps {
  children: ReactNode;
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
