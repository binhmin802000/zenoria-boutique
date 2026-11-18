import React, { useState } from "react";
import { Globe, RefreshCw } from "lucide-react";
import { supabase, getMediaUrl, PRODUCT_MEDIA_PUBLIC_BASE_URL, PRODUCT_MEDIA_SUPABASE_BASE_URL, SITE_MEDIA_TABLE } from "@/lib/supabase";
import { RING_SLOT } from "@/lib/ringSettings";

const initial = { state: "idle", result: null, error: "", checkedAt: null };
function sourceFor(url, selectedBase, supabaseBase) {
  const target = new URL(url);
  const selected = new URL(selectedBase);
  const sb = new URL(supabaseBase);
  const within = (base) => target.origin === base.origin && target.pathname.startsWith(base.pathname.replace(/\/$/, "") + "/");
  const configured = selected.origin === sb.origin && selected.pathname === sb.pathname ? "Supabase" : "R2";
  const actual = within(sb) ? "Supabase" : within(selected) ? configured : "Autre URL";
  return { configured, actual, domain: target.hostname };
}
export default function AdminR2PublicCheck({ busy = false, onResult }) {
  const [check, setCheck] = useState(initial);
  const finish = (next) => { setCheck(next); if (onResult) onResult(next); };
  async function run() {
    setCheck({ ...initial, state: "running" });
    const start = performance.now();
    try {
      const { data, error } = await supabase.from(SITE_MEDIA_TABLE).select("path").eq("slot", RING_SLOT).maybeSingle();
      if (error) throw new Error("Lecture du media temoin impossible : " + error.message);
      if (!data?.path || typeof data.path !== "string") {
        finish({ state: "warn", result: null, error: "Aucune photo personnalisee disponible pour Le geste.", checkedAt: Date.now() });
        return;
      }
      const url = getMediaUrl(data.path, "site");
      if (!url) throw new Error("URL publique du media introuvable.");
      const parsed = new URL(url, window.location.origin);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL publique invalide.");
      const source = sourceFor(parsed.href, PRODUCT_MEDIA_PUBLIC_BASE_URL, PRODUCT_MEDIA_SUPABASE_BASE_URL);
      // A browser image probe avoids HEAD-only false negatives and CORS requirements for opaque GET responses.
      // An image load does not expose an HTTP status; do not invent one.
      const image = new Image();
      const loaded = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { image.src = ""; reject(new Error("Delai de chargement depasse (15 s).")); }, 15000);
        image.onload = () => { clearTimeout(timer); resolve(true); };
        image.onerror = () => { clearTimeout(timer); reject(new Error("Chargement de l'image impossible (HTTP ou reseau non identifiable depuis le navigateur).")); };
        image.src = parsed.href;
      });
      if (!loaded) throw new Error("Image indisponible.");
      const result = { ...source, durationMs: Math.round(performance.now() - start), http: "Non accessible via Image()", loaded: true };
      const status = source.actual === "R2" ? "ok" : "warn";
      finish({ state: status, result, error: status === "warn" ? "Image chargee, mais la diffusion R2 n'est pas confirmee." : "", checkedAt: Date.now() });
    } catch (error) {
      finish({ state: "fail", result: null, error: error?.message || String(error), checkedAt: Date.now() });
    }
  }
  const labels = { idle: "Non teste", running: "En cours", ok: "Reussi", warn: "Attention", fail: "Echec" };
  return (
    <article className="mt-4 rounded-xl border border-[#eee2e5] p-4" data-testid="r2-public">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2"><Globe size={18} className="mt-0.5 text-[#8f6075]" /><div><h3 className="text-sm font-medium">Diffusion publique</h3><p className="mt-1 text-[11px] text-[#8b737e]">Photo de l'animation Le geste. Controle manuel en lecture seule.</p></div></div>
        <span className="rounded-full bg-[#f5edf1] px-3 py-1 text-xs">{labels[check.state]}</span>
      </div>
      {check.result && <div className="mt-3 text-xs leading-5 text-[#54434c]">
        <p>Fournisseur configure : <strong>{check.result.configured}</strong></p>
        <p>Source du media : <strong>{check.result.actual}</strong></p>
        <p>Domaine : <strong className="break-all">{check.result.domain}</strong></p>
        <p>Image chargee · {check.result.durationMs} ms</p>
        <p>Code HTTP : non disponible (controle de chargement d'image).</p>
      </div>}
      {check.error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{check.error}</p>}
      {check.checkedAt && <p className="mt-2 text-[11px] text-[#8b737e]">Dernier controle : {new Date(check.checkedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>}
      <button type="button" disabled={busy || check.state === "running"} onClick={run} data-testid="r2-public-run" className="mt-4 flex h-9 items-center gap-2 rounded-full border border-[#d9c5cc] px-4 text-xs hover:bg-[#f5edf1] disabled:opacity-50"><RefreshCw size={14} className={check.state === "running" ? "animate-spin" : ""} />Tester la diffusion publique</button>
    </article>
  );
}
