import React from "react";
import { reportClientError } from "@/lib/errorLogger";

// ============================================================
// ErrorBoundary - filet de sécurité de l'affichage
//
// Sans lui, une erreur pendant l'affichage d'une page laisse un écran blanc. Avec lui, la
// visiteuse voit un message clair avec un bouton « Recharger », et l'erreur est inscrite
// dans le journal (voir lib/errorLogger.js).
// ============================================================

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    const where = info && info.componentStack ? String(info.componentStack).trim().split("\n")[0].trim() : "";
    const name = error && error.name ? error.name : "Error";
    const message = error && error.message ? error.message : String(error);
    reportClientError("react_error", name + ": " + message + (where ? " — " + where : ""));
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" data-testid="error-fallback" className="min-h-screen grid place-items-center bg-[#fbf8f4] text-[#342b32] p-6">
        <div className="text-center max-w-sm">
          <div className="font-serif text-3xl mb-3">Oups, un souci est survenu</div>
          <p className="text-sm text-[#70656a] mb-6 leading-6">
            La page n&apos;a pas pu s&apos;afficher correctement. Rechargez la page : si le problème persiste, réessayez dans quelques minutes.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
