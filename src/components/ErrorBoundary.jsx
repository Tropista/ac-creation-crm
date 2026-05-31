import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 16,
          background: "#fee2e2",
          border: "1px solid #fca5a5",
          borderRadius: 8,
          marginBottom: 24,
          fontSize: 13,
          color: "#dc2626",
        }}>
          <strong>Erreur dans les graphiques :</strong>{" "}
          {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
