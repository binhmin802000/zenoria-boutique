// ZENORIA_MEDIA_VARIANTS_V1
import React, { useCallback, useRef, useState } from "react";
import { supabase, getMediaUrl, PRODUCT_MEDIA_BUCKET } from "@/lib/supabase";
import { collectPhotoPaths } from "@/lib/mediaVariants";
import { makeThumbBlob } from "@/lib/mediaVariantsBrowser";
// ============================================================
// CARTE « MINIATURES DES BIJOUX » (onglet « Contenu du site » de /admin, groupe « Vitrine & ambiance »).
//
// Les photos envoyees DEPUIS la mise en place des miniatures en ont deja une. Cette carte cree celles des photos plus
// anciennes, en un clic : pour chaque photo sans miniature, le navigateur lit la photo une fois, la reduit (640 px), puis
// envoie la miniature a cote de l'original. Sans danger : rien n'est modifie ni supprime, une miniature deja presente
// n'est jamais ecrasee, et on peut relancer l'operation autant de fois que l'on veut.
//
// « Verifier » ne lit AUCUNE photo : il demande seulement si chaque miniature existe (requete sans contenu).
// ============================================================
const CONCURRENCY = 4;

async function thumbExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (res.ok) return "yes";
    if (res.status === 400 || res.status === 404) return "no";
    return "unknown";
  } catch (e) {
    return "unknown";
  }
}

async function runPool(items, worker, shouldStop) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length && !shouldStop()) {
      const i = next;
      next += 1;
      await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
}

function alreadyThere(err) {
  const msg = (err && (err.message || err.error || "")) + " " + (err && err.statusCode ? err.statusCode : "");
  return /already exists|Duplicate|409/i.test(msg);
}

export default function AdminMediaVariants() {
  const [phase, setPhase] = useState("idle"); // idle | scanning | ready | generating | done
  const [scan, setScan] = useState(null); // { total, present, missing: [item], unknown: [item] }
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState([]);
  const [created, setCreated] = useState(0);
  const [message, setMessage] = useState(null); // { type: "ok" | "error", text }
  const stopRef = useRef(false);

  const runScan = useCallback(async () => {
    setPhase("scanning");
    setMessage(null);
    setErrors([]);
    try {
      const res = await supabase.from("products").select("id, slug, name, photos");
      if (res.error) throw res.error;
      const items = collectPhotoPaths(res.data || []);
      const present = [];
      const missing = [];
      const unknown = [];
      await runPool(
        items,
        async (it) => {
          const state = await thumbExists(getMediaUrl(it.thumb, it.slug));
          (state === "yes" ? present : state === "no" ? missing : unknown).push(it);
        },
        () => false
      );
      setScan({ total: items.length, present: present.length, missing, unknown });
      setPhase("ready");
    } catch (e) {
      setMessage({ type: "error", text: "Impossible de lire la liste des photos : " + ((e && e.message) || "erreur inconnue") + "." });
      setPhase("idle");
    }
  }, []);

  const generate = useCallback(async () => {
    if (!scan || scan.missing.length === 0) return;
    stopRef.current = false;
    setPhase("generating");
    setMessage(null);
    setErrors([]);
    setCreated(0);
    const todo = scan.missing;
    setProgress({ done: 0, total: todo.length });
    const errs = [];
    let ok = 0;
    let done = 0;
    await runPool(
      todo,
      async (it) => {
        try {
          const resp = await fetch(getMediaUrl(it.path, it.slug));
          if (!resp.ok) throw new Error("photo illisible (HTTP " + resp.status + ")");
          const blob = await resp.blob();
          const thumb = await makeThumbBlob(blob);
          if (!thumb) throw new Error("miniature impossible à créer");
          const up = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(it.thumb, thumb, { cacheControl: "31536000", upsert: false, contentType: "image/jpeg" });
          if (up.error && !alreadyThere(up.error)) throw up.error;
          ok += 1;
        } catch (e) {
          errs.push(it.path + " : " + ((e && e.message) || "erreur"));
        }
        done += 1;
        setProgress({ done, total: todo.length });
        setCreated(ok);
      },
      () => stopRef.current
    );
    setErrors(errs.slice(0, 10));
    setCreated(ok);
    if (stopRef.current) setMessage({ type: "ok", text: "Opération interrompue : " + ok + " miniature(s) créée(s). Vous pouvez la relancer." });
    else if (errs.length === 0) setMessage({ type: "ok", text: ok + " miniature(s) créée(s). Toutes les photos ont maintenant leur miniature." });
    else setMessage({ type: "error", text: ok + " miniature(s) créée(s), " + errs.length + " en échec. Vous pouvez relancer : seules les manquantes seront traitées." });
    setPhase("done");
  }, [scan]);

  const busy = phase === "scanning" || phase === "generating";
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section data-testid="media-variants-card" className="rounded-2xl border border-[#eadfe4] bg-white p-5">
      <div className="min-w-0">
        <h3 className="font-serif text-lg text-[#412f3b]">Miniatures des bijoux</h3>
        <p className="text-xs text-[#8b737e] mt-1 leading-4">
          Les vignettes du panier, des favoris, de Mon compte et du quiz chargent une version nettement plus légère de chaque photo, ce qui économise votre quota Supabase. Les nouvelles photos ont leur miniature automatiquement ; cette carte crée celles des photos déjà en ligne.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={runScan} disabled={busy} data-testid="media-variants-scan" className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-10 text-sm disabled:opacity-60">
          {phase === "scanning" ? "Vérification…" : "Vérifier"}
        </button>
        {scan && scan.missing.length > 0 && phase !== "generating" && (
          <button type="button" onClick={generate} disabled={busy} data-testid="media-variants-generate" className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm font-medium disabled:opacity-60">
            Générer les {scan.missing.length} miniature{scan.missing.length > 1 ? "s" : ""} manquante{scan.missing.length > 1 ? "s" : ""}
          </button>
        )}
        {phase === "generating" && (
          <button type="button" onClick={() => { stopRef.current = true; }} data-testid="media-variants-stop" className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-10 text-sm">
            Interrompre
          </button>
        )}
      </div>
      {scan && (
        <p data-testid="media-variants-summary" className="mt-3 text-sm text-[#54434c]">
          {scan.total} photo{scan.total > 1 ? "s" : ""} · {scan.present} miniature{scan.present > 1 ? "s" : ""} présente{scan.present > 1 ? "s" : ""} · {scan.missing.length} manquante{scan.missing.length > 1 ? "s" : ""}
          {scan.unknown.length > 0 ? " · " + scan.unknown.length + " non vérifiée(s) (réseau)" : ""}
        </p>
      )}
      {phase === "generating" && (
        <div className="mt-3" data-testid="media-variants-progress">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 rounded-full bg-[#f0e6ea] overflow-hidden">
            <div className="h-full rounded-full bg-[#8f6075] transition-all" style={{ width: pct + "%" }} />
          </div>
          <p className="text-xs text-[#8b737e] mt-1 tabular-nums">{progress.done} / {progress.total} · {created} créée(s). Laissez cet onglet ouvert.</p>
        </div>
      )}
      <div aria-live="polite">
        {message && (
          <div data-testid="media-variants-message" data-type={message.type} className={"mt-3 rounded-xl text-sm px-4 py-3 " + (message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
            {message.text}
          </div>
        )}
        {errors.length > 0 && (
          <ul data-testid="media-variants-errors" className="mt-2 text-xs text-red-700 space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="break-all">{e}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
