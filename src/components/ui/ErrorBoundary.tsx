import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg-primary)] p-8 text-[var(--color-text-primary)]">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <pre className="max-w-2xl whitespace-pre-wrap rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] p-4 text-xs text-[var(--color-danger)]">
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-border)]"
        >
          Try again
        </button>
      </div>
    );
  }
}
