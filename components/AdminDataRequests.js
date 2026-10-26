import React, { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Download, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

// ============================================================
// ADMIN — RGPD : liste des demandes d'export et de suppression
// ============================================================
// onPendingCountChange : informe le parent (AdminPage) du nombre de
// demandes en attente, pour afficher le badge sur l'onglet.
// ============================================================
export default function AdminDataRequests({ onPendingCountChange }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("data_requests")
        .select("id, user_id, type, status, requested_at, processed_at")
        .order("requested_at", { ascending: false });
      if (err) throw err;
      const list = data || [];
      setRows(list);
      const pendingCount = list.filter((r) => r.status === "pending").length;
      if (onPendingCountChange) onPendingCountChange(pendingCount);
    } catch (e) {
      setError("Impossible de charger les demandes pour le moment.");
    }
    setLoading(false);
  }, [onPendingCountChange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const processDeletion = async (requestId) => {
    if (!window.confirm("Confirmer l'anonymisation de ce compte ? Cette action est irréversible.")) return;
    setProcessingId(requestId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData && sessionData.session ? sessionData.session.access_token : null;
      const res = await fetch("/api/admin/data-requests/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "échec");
      setToast("Demande traitée : compte anonymisé.");
      await load();
    } catch (e) {
      setError("Impossible de traiter cette demande pour le moment.");
    }
    setProcessingId(null);
  };

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <div className="rounded-2xl border border-[#eadfe4] bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-[#8f6075]" />
        <h3 className="font-serif text-lg text-[#412f3b]">RGPD — Demandes clientes</h3>
      </div>
      <p className="text-xs text-[#8b737e] mb-4">
        Export : automatique, déclenché par la cliente. Suppression : à valider ici (anonymisation, factures conservées).
      </p>

      {error && <div role="alert" className="mb-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{error}</div>}
      {toast && <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{toast}</div>}

      {loading ? (
        <p className="text-sm text-[#8b737e]">Chargement…</p>
      ) : (
        <>
          <h4 className="text-sm font-medium text-[#412f3b] mb-2">En attente ({pending.length})</h4>
          {pending.length === 0 ? (
            <p className="text-xs text-[#8b737e] mb-5">Aucune demande en attente.</p>
          ) : (
            <div className="space-y-2 mb-5">
              {pending.map((r) => (
                <div key={r.id} data-testid={`data-request-${r.id}`} className="flex items-center justify-between rounded-xl border border-[#eee2e5] p-3">
                  <div className="text-sm">
                    <span className="font-medium text-[#412f3b]">{r.type === "deletion" ? "Suppression" : "Export"}</span>
                    <span className="text-[#8b737e]"> · demandée le {formatDateTime(r.requested_at)}</span>
                  </div>
                  {r.type === "deletion" && (
                    <button
                      type="button"
                      onClick={() => processDeletion(r.id)}
                      disabled={processingId === r.id}
                      data-testid={`process-deletion-${r.id}`}
                      className="flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 h-8 text-xs disabled:opacity-50"
                    >
                      <Trash2 size={13} /> {processingId === r.id ? "Traitement…" : "Anonymiser"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <h4 className="text-sm font-medium text-[#412f3b] mb-2">Traitées ({done.length})</h4>
          {done.length === 0 ? (
            <p className="text-xs text-[#8b737e]">Aucune demande traitée pour le moment.</p>
          ) : (
            <div className="space-y-1">
              {done.map((r) => (
                <div key={r.id} className="text-xs text-[#8b737e] flex items-center gap-2">
                  <Download size={12} />
                  {r.type === "deletion" ? "Suppression" : "Export"} — traitée le {formatDateTime(r.processed_at)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}