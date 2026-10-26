import React, { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ============================================================
// « MES DONNÉES » — export PDF (immédiat) et demande de suppression
// (nécessite une validation admin, voir components/AdminDataRequests.js)
// ============================================================
export default function AccountDataSection({ user }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [deletionBusy, setDeletionBusy] = useState(false);

  const downloadMyData = async () => {
    setExporting(true);
    setExportError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData && sessionData.session ? sessionData.session.access_token : null;
      if (!token) throw new Error("session invalide");
      const res = await fetch(`/api/data-export/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let message = "Impossible de générer l'export pour le moment.";
        try { const j = await res.json(); if (j && j.error) message = j.error; } catch (e) { /* réponse non JSON */ }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zenoria-mes-donnees.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e && e.message ? e.message : "Impossible de générer l'export pour le moment.");
    }
    setExporting(false);
  };

  const requestDeletion = async () => {
    if (!window.confirm("Confirmer votre demande de suppression de compte ? Une administratrice la traitera prochainement.")) return;
    setDeletionBusy(true);
    setDeletionError("");
    try {
      const { error: err } = await supabase.from("data_requests").insert({ user_id: user.id, type: "deletion" });
      if (err) throw err;
      setDeletionRequested(true);
    } catch (e) {
      setDeletionError("Impossible d'enregistrer votre demande pour le moment.");
    }
    setDeletionBusy(false);
  };

  return (
    <div data-testid="section-donnees-content">
      <h2 className="font-serif text-2xl text-[#412f3b] mb-1">Mes données</h2>
      <p className="text-sm text-[#8b737e] mb-5">Conformément au RGPD, vous pouvez obtenir une copie de vos données ou demander la suppression de votre compte.</p>

      <div className="rounded-2xl border border-[#eee2e5] p-4 mb-4">
        <h3 className="font-serif text-lg text-[#412f3b] mb-1">Télécharger mes données</h3>
        <p className="text-sm text-[#70656a] mb-3">Un PDF reprenant vos commandes, avis et favoris, généré immédiatement.</p>
        {exportError && <div role="alert" className="mb-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{exportError}</div>}
        <button
          type="button"
          onClick={downloadMyData}
          disabled={exporting}
          data-testid="download-my-data-btn"
          className="flex items-center gap-2 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm disabled:opacity-50"
        >
          <Download size={15} /> {exporting ? "Génération…" : "Télécharger mes données (PDF)"}
        </button>
      </div>

      <div className="rounded-2xl border border-[#eee2e5] p-4">
        <h3 className="font-serif text-lg text-[#412f3b] mb-1">Supprimer mon compte</h3>
        <p className="text-sm text-[#70656a] mb-3">
          Votre demande sera examinée par une administratrice. Vos factures restent conservées pour nos obligations légales (10 ans), le reste de vos données personnelles est anonymisé.
        </p>
        {deletionError && <div role="alert" className="mb-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{deletionError}</div>}
        {deletionRequested ? (
          <p className="text-sm text-emerald-700" data-testid="deletion-requested-msg">Votre demande a bien été enregistrée.</p>
        ) : (
          <button
            type="button"
            onClick={requestDeletion}
            disabled={deletionBusy}
            data-testid="request-deletion-btn"
            className="flex items-center gap-2 rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1] disabled:opacity-50"
          >
            <Trash2 size={15} /> {deletionBusy ? "Envoi…" : "Demander la suppression de mon compte"}
          </button>
        )}
      </div>
    </div>
  );
}