import React, { useState } from "react";
import AdminR2PublicCheck from "@/components/AdminR2PublicCheck";
import { RefreshCw, Server, Files } from "lucide-react";
import { supabase } from "@/lib/supabase";

const EMPTY = Object.freeze({ status: "idle", error: "", data: null, checkedAt: null });
const STATE_STYLE = {
  idle: "bg-[#f0e6ea] text-[#8b737e]",
  running: "bg-sky-50 text-sky-700",
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  fail: "bg-red-50 text-red-700",
};
const STATE_LABEL = { idle: "Non teste", running: "En cours", ok: "Reussi", warn: "Attention", fail: "Echec" };

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1).replace(".", ",") + " Kio";
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1).replace(".", ",") + " Mio";
  return (bytes / 1024 ** 3).toFixed(2).replace(".", ",") + " Gio";
}
function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—";
}
async function adminPost(url) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Session administrateur introuvable. Reconnectez-vous.");
  const response = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + data.session.access_token } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Diagnostic R2 impossible.");
  return payload;
}
function StatusChip({ status }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap ${STATE_STYLE[status]}`}>{STATE_LABEL[status]}</span>;
}
function DifferenceList({ title, rows }) {
  if (!rows?.length) return null;
  return (
    <details className="mt-2 rounded-lg bg-[#faf6f8] px-3 py-2 text-[11px]">
      <summary className="cursor-pointer font-medium">{title} ({rows.length})</summary>
      <ul className="mt-2 max-h-40 overflow-auto space-y-1 break-all">{rows.map((row) => <li key={row}>{row}</li>)}</ul>
    </details>
  );
}

export default function AdminR2Health() {
  const [connection, setConnection] = useState(EMPTY);
  const [inventory, setInventory] = useState(EMPTY);
  const busy = connection.status === "running" || inventory.status === "running";

  const runConnection = async () => {
    setConnection({ ...EMPTY, status: "running" });
    try {
      const data = await adminPost("/api/admin/r2/check");
      setConnection({ status: "ok", error: "", data, checkedAt: Date.now() });
    } catch (error) {
      setConnection({ status: "fail", error: error.message || String(error), data: null, checkedAt: Date.now() });
    }
  };
  const runInventory = async () => {
    setInventory({ ...EMPTY, status: "running" });
    try {
      const data = await adminPost("/api/admin/r2/inventory");
      const c = data.comparison || {};
      const truncated = Boolean(data.supabase?.truncated || data.r2?.truncated);
      const broken = Number(c.missingInR2Count) > 0 || Number(c.sizeMismatchCount) > 0;
      const warning = truncated || Number(c.onlyInR2Count) > 0;
      setInventory({ status: broken ? "fail" : warning ? "warn" : "ok", error: "", data, checkedAt: Date.now() });
    } catch (error) {
      setInventory({ status: "fail", error: error.message || String(error), data: null, checkedAt: Date.now() });
    }
  };

  const c = inventory.data?.comparison || {};
  const truncated = Boolean(inventory.data?.supabase?.truncated || inventory.data?.r2?.truncated);
  return (
    <section className="rounded-2xl bg-white border border-[#eee2e5] p-5 mb-8" data-testid="r2-health">
      <div className="mb-4">
        <h2 className="font-serif text-xl">Cloudflare R2</h2>
        <p className="text-[12px] text-[#756a70] leading-5 mt-1">Controles manuels du bucket et comparaison en lecture seule avec Supabase. Aucun diagnostic ne demarre a l'ouverture de l'onglet.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <article className="rounded-xl border border-[#eee2e5] p-4" data-testid="r2-connection">
          <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><Server size={18} className="mt-0.5 text-[#8f6075]"/><div><h3 className="text-sm font-medium">Connexion au bucket</h3><p className="text-[11px] text-[#8b737e] mt-1">Verifie l'acces serveur sans creer de fichier.</p></div></div><StatusChip status={connection.status}/></div>
          {connection.data && <p className="mt-3 text-xs text-[#54434c]">Bucket : <strong>{connection.data.bucket}</strong> · {connection.data.durationMs} ms</p>}
          {connection.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{connection.error}</p>}
          {connection.checkedAt && <p className="mt-2 text-[11px] text-[#8b737e]">Dernier test : {formatDateTime(connection.checkedAt)}</p>}
          <button type="button" onClick={runConnection} disabled={busy} className="mt-4 flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-9 text-xs disabled:opacity-50" data-testid="r2-check-run"><RefreshCw size={14} className={connection.status === "running" ? "animate-spin" : ""}/>Tester la connexion</button>
        </article>
        <article className="rounded-xl border border-[#eee2e5] p-4" data-testid="r2-inventory">
          <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><Files size={18} className="mt-0.5 text-[#8f6075]"/><div><h3 className="text-sm font-medium">Cohérence Supabase / R2</h3><p className="text-[11px] text-[#8b737e] mt-1">Compare les chemins et tailles, sans controle SHA-256.</p></div></div><StatusChip status={inventory.status}/></div>
          {inventory.data && <div className="mt-3 text-xs text-[#54434c] leading-5"><p>Supabase : <strong>{inventory.data.supabase.count}</strong> fichier(s), {formatBytes(inventory.data.supabase.bytes)}</p><p>R2 : <strong>{inventory.data.r2.count}</strong> fichier(s), {formatBytes(inventory.data.r2.bytes)}</p><p className="mt-1">Absents de R2 : <strong>{c.missingInR2Count || 0}</strong> · Seulement dans R2 : <strong>{c.onlyInR2Count || 0}</strong> · Tailles differentes : <strong>{c.sizeMismatchCount || 0}</strong></p>{truncated && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">Controle incomplet : au moins un inventaire a atteint la limite de 2 000 fichiers.</p>}<DifferenceList title="Absents de R2" rows={c.missingInR2}/><DifferenceList title="Seulement dans R2" rows={c.onlyInR2}/><DifferenceList title="Tailles differentes" rows={c.sizeMismatch}/></div>}
          {inventory.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{inventory.error}</p>}
          {inventory.checkedAt && <p className="mt-2 text-[11px] text-[#8b737e]">Dernier controle : {formatDateTime(inventory.checkedAt)}</p>}
          <button type="button" onClick={runInventory} disabled={busy} className="mt-4 flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-9 text-xs disabled:opacity-50" data-testid="r2-inventory-run"><RefreshCw size={14} className={inventory.status === "running" ? "animate-spin" : ""}/>Comparer les stockages</button>
        </article>
      </div>
      <AdminR2PublicCheck busy={busy} />
      <p className="text-[11px] text-[#8b737e] mt-4 leading-4">Un succes de connexion valide l'acces au bucket, pas la diffusion publique des medias. La comparaison est strictement en lecture seule.</p>
    </section>
  );
}
