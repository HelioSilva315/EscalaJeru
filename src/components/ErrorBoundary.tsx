import { Component, type ErrorInfo, type ReactNode } from "react";
import { APP_NAME } from "@/lib/config";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("EscalaJeru:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "var(--paper)",
            color: "var(--ink)",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 380 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "var(--pine)",
                color: "#f6f3ec",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 18px",
                fontFamily: "var(--font-display)",
                fontSize: 24,
              }}
            >
              J
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, marginBottom: 8 }}>
              Algo saiu do ritmo
            </h1>
            <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 20 }}>
              Encontramos um erro inesperado no {APP_NAME}. Recarregue a página para
              continuar; seus dados estão salvos.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
