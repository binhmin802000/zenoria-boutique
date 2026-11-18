import React, { useState } from "react";
import { RefreshCw, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";

const initial = { state: "idle", data: null, error: "", checkedAt: null };
async function adminPostCycle() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Session administrateur introuvable. Reconnectez-vous.");
  const response = await fetch("/api/admin/r2/object-cycle", { method: "POST", headers: { Authorization: "Bearer " + data.session.access_token } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Cycle technique R2 impossible.");
  return payload;
}
function Step({ label, value }) { return <li className="flex justify-between gap-3"><span>{label}</span><strong>{value ? "Oui" : "Non"}</strong></li>; }
export default function AdminR2CycleCheck({ busy = false, onRunning, onResult }) {
  const [check, setCheck] = useState(initial);
  const finish = (next) => { setCheck(next); if (onResult) onResult(next); };
  async function run() {
    if (!window.confirm("Ce test cree puis supprime un petit fichier technique dans R2. Aucun media Zenoria ne sera modifie. Continuer ?")) return;
    const running = { ...initial, state: "running" };
    setCheck(running); if (onRunning) onRunning(true);
    try {
      const data = await adminPostCycle();
      const next = { state: data.ok ? "ok" : "fail", data, error: data.error || "", checkedAt: Date.now() };
      finish(next);
    } catch (error) {
      finish({ state: "fail", data: null, error: error?.message || String(error), checkedAt: Date.now() });
    } finally {
      if (onRunning) onRunning(false);
    }
  }
  const labels = { idle: "Non teste", running: "En cours", ok: "Reussi", fail: "Echec" };
  return <article className="mt-4 rounded-xl border border-[#eee2e5] p-4" data-testid="r2-cycle">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-2"><Wrench size={18} className="mt-0.5 text-[#8f6075]"/><div><h3 className="text-sm font-medium">Cycle technique</h3><p className="mt-1 text-[11px] text-[#8b737e]">Cree, verifie puis supprime un petit fichier dans diagnostics/. Aucun media commercial n'est touche.</p></div></div><span className="rounded-full bg-[#f5edf1] px-3 py-1 text-xs">{labels[check.state]}</span></div>
    {check.data && <ul className="mt-3 space-y-1 text-xs text-[#54434c]"><Step label="Objet cree" value={check.data.created}/><Step label="Taille verifiee" value={check.data.verified}/><Step label="Nettoyage tente" value={check.data.cleanupAttempted}/><Step label="Suppression demandee" value={check.data.deleteRequested}/><Step label="Suppression confirmee" value={check.data.deleted}/><li className="flex justify-between gap-3"><span>Duree</span><strong>{check.data.durationMs || 0} ms</strong></li>{check.data.errorCode && <li className="break-all">Code : <strong>{check.data.errorCode}</strong></li>}</ul>}
    {check.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{check.error}</p>}
    <button type="button" disabled={busy || check.state === "running"} onClick={run} data-testid="r2-cycle-run" className="mt-4 flex h-9 items-center gap-2 rounded-full border border-[#d9c5cc] px-4 text-xs hover:bg-[#f5edf1] disabled:opacity-50"><RefreshCw size={14} className={check.state === "running" ? "animate-spin" : ""}/>Tester l'ecriture et la suppression</button>
  </article>;
}
