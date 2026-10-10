import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { decodeImage, loadWatermarkBitmap, renderPhoto, watermarkBox, MAX_SIDE } from "@/lib/prepareImage";
import {
  FRAME_WIDTH,
  FRAME_ASPECT,
  MAX_ZOOM,
  MIN_SOURCE_WIDTH_WARN,
  clamp,
  cropRect,
  toFractions,
  outputSize,
  visibleFraction,
} from "@/lib/cropMath";

// ============================================================
// PhotoCropper - fenetre de cadrage d'une photo avant son envoi
//
// L'administratrice voit la photo dans le CADRE REEL DE LA FICHE PRODUIT du
// site (448 x 360). Elle la fait glisser pour centrer la bague et regle le
// zoom. A la validation, le fichier enregistre est exactement ce cadre, et le
// filigrane est pose en bas a gauche de cette photo recadree.
//
// Le composant ne fait QUE le cadrage : il renvoie le resultat a la page
// d'administration par onResult({ action, crop }) :
//   { action: "crop", crop: { x, y, w, h } }  cadrage valide (fractions 0 a 1)
//   { action: "whole" }                       photo entiere, sans recadrage
//   { action: "skip" }                        ignorer cette photo
//   { action: "cancel" }                      tout annuler
// ============================================================

// Vues du site dans lesquelles la photo enregistree sera affichee
// (dimensions reelles du site pour un ecran d'ordinateur).
const VIEWS = [
  { key: "pc", label: "Fiche produit (PC)", w: 448, h: 360 },
  { key: "card", label: "Carte du catalogue", w: 395, h: 224 },
  { key: "mobile", label: "Fiche produit (mobile)", w: 358, h: 360 },
  { key: "circle", label: "Cercle (bannière)", w: 300, h: 300, circle: true },
];
const PREVIEW_SCALE = 0.4; // les aperçus sont affichés à 40 % de leur taille réelle

function drawCover(canvas, source, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const s = Math.max(w / source.width, h / source.height);
  const dw = source.width * s;
  const dh = source.height * s;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// Une infime partie du filigrane (moins de 10 %) n'est pas lisible : on la compte comme « coupée ».
function badgeFor(fraction) {
  if (fraction >= 0.95) return { text: "filigrane visible", style: "bg-emerald-50 text-emerald-700" };
  if (fraction >= 0.1) return { text: "filigrane partiel", style: "bg-amber-50 text-amber-700" };
  return { text: "filigrane coupé", style: "bg-[#f0e6ea] text-[#8b737e]" };
}

export default function PhotoCropper({ file, index = 1, total = 1, onResult }) {
  const [bitmap, setBitmap] = useState(null);
  const [wm, setWm] = useState(null);
  const [displayUrl, setDisplayUrl] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState(true);
  const [frameW, setFrameW] = useState(FRAME_WIDTH);

  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const canvasRefs = useRef({});
  const latest = useRef({});

  // ---- Chargement de la photo et du filigrane ----
  useEffect(() => {
    let cancelled = false;
    let url = "";
    (async () => {
      try {
        const [bmp, watermark] = await Promise.all([decodeImage(file), loadWatermarkBitmap()]);
        if (cancelled) return;
        // Image d'affichage allégée (les calculs restent faits sur la photo d'origine).
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.9));
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBitmap(bmp);
        setWm(watermark);
        setDisplayUrl(url);
        setCenter({ x: bmp.width / 2, y: bmp.height / 2 });
      } catch (e) {
        if (!cancelled) setError((e && e.message) || "Cette photo n'a pas pu être ouverte.");
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  // ---- Largeur du cadre : 448 px au maximum, réduite sur petit écran ----
  useEffect(() => {
    const update = () => setFrameW(Math.max(240, Math.min(FRAME_WIDTH, window.innerWidth - 72)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const ready = Boolean(bitmap && wm && displayUrl);
  const imgW = bitmap ? bitmap.width : 1;
  const imgH = bitmap ? bitmap.height : 1;
  const rect = ready ? cropRect(imgW, imgH, FRAME_ASPECT, zoom, center.x, center.y) : null;
  const frameH = frameW / FRAME_ASPECT;
  const scale = rect ? frameW / rect.w : 1; // pixels d'écran par pixel de la photo

  latest.current = { zoom, center, imgW, imgH, ready };

  // Applique un zoom et un centre en gardant le cadre à l'intérieur de la photo.
  const applyView = (nextZoom, cx, cy) => {
    const z = clamp(nextZoom, 1, MAX_ZOOM);
    const r = cropRect(imgW, imgH, FRAME_ASPECT, z, cx, cy);
    setZoom(z);
    setCenter({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  };

  // ---- Glisser pour déplacer la photo ----
  const onPointerDown = (e) => {
    if (!ready) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y, s: scale };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    applyView(zoom, d.cx - (e.clientX - d.x) / d.s, d.cy - (e.clientY - d.y) / d.s);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  // ---- Molette pour zoomer (écouteur natif : il faut pouvoir bloquer le défilement de la page) ----
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const st = latest.current;
      if (!st.ready) return;
      e.preventDefault();
      const next = clamp(st.zoom * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM);
      const r = cropRect(st.imgW, st.imgH, FRAME_ASPECT, next, st.center.x, st.center.y);
      setZoom(next);
      setCenter({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ready]);

  // ---- Clavier : flèches pour déplacer, + et - pour zoomer ----
  const onKeyDown = (e) => {
    if (!ready || !rect) return;
    const step = rect.w * 0.03;
    if (e.key === "ArrowLeft") applyView(zoom, center.x - step, center.y);
    else if (e.key === "ArrowRight") applyView(zoom, center.x + step, center.y);
    else if (e.key === "ArrowUp") applyView(zoom, center.x, center.y - step);
    else if (e.key === "ArrowDown") applyView(zoom, center.x, center.y + step);
    else if (e.key === "+" || e.key === "=") applyView(zoom * 1.1, center.x, center.y);
    else if (e.key === "-") applyView(zoom / 1.1, center.x, center.y);
    else return;
    e.preventDefault();
  };

  // ---- Taille du fichier enregistré et position du filigrane ----
  const out = rect ? outputSize(rect.w, rect.h, MAX_SIDE) : null;
  const box = out && wm ? watermarkBox(out.width, out.height, wm, "bas-gauche") : null;
  const views = useMemo(() => {
    if (!out || !box) return VIEWS.map((v) => ({ ...v, frac: null }));
    return VIEWS.map((v) => ({
      ...v,
      frac: visibleFraction(box, out.width, out.height, v.w, v.h, Boolean(v.circle)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out && out.width, out && out.height, box && box.x, box && box.y, box && box.wmW]);

  // ---- Aperçus en direct (photo recadrée + filigrane, dans chaque vue du site) ----
  useEffect(() => {
    if (!ready || !rect) return undefined;
    const id = requestAnimationFrame(() => {
      const fractions = toFractions(rect, imgW, imgH);
      const full = renderPhoto(bitmap, fractions, wm, { maxSide: MAX_SIDE, previewWidth: FRAME_WIDTH });
      VIEWS.forEach((v) => {
        const canvas = canvasRefs.current[v.key];
        if (canvas) drawCover(canvas, full, v.w, v.h);
      });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rect && rect.x, rect && rect.y, rect && rect.w, rect && rect.h]);

  const validate = () => {
    if (!rect) return;
    onResult({ action: "crop", crop: toFractions(rect, imgW, imgH) });
  };

  const lowRes = Boolean(rect && rect.w < MIN_SOURCE_WIDTH_WARN);
  const fr = rect ? toFractions(rect, imgW, imgH) : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/55 z-50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cadrer la photo"
        className="fixed z-50 inset-x-3 top-[3%] max-w-4xl mx-auto bg-white rounded-[2rem] shadow-2xl max-h-[94vh] overflow-y-auto"
      >
        <div className="p-5 sm:p-6">
          <div className="flex justify-between items-start gap-3 mb-2">
            <div className="min-w-0">
              <h2 className="font-serif text-2xl">Cadrer la photo</h2>
              <p className="text-xs text-[#8b737e] truncate">
                Photo {index} sur {total} · {file.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onResult({ action: "cancel" })}
              className="h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-[#f0e6ea]"
              aria-label="Tout annuler"
              title="Tout annuler"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-sm text-[#70656a] mb-4 leading-5">
            Faites glisser la photo pour centrer la bague, puis réglez le zoom. Le fichier enregistré sera exactement ce
            cadre, avec le filigrane « © 2026 ZENORIA » ajouté en bas à gauche.
          </p>

          {error ? (
            <div className="rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm mb-4" role="alert">
              {error}
            </div>
          ) : !ready ? (
            <p className="text-sm text-[#8b737e] py-10 text-center">Chargement de la photo...</p>
          ) : (
            <div className="grid md:grid-cols-[auto_1fr] gap-6">
              {/* ----- Cadre de cadrage ----- */}
              <div>
                <div
                  ref={frameRef}
                  data-testid="crop-frame"
                  data-crop={`${fr.x.toFixed(4)},${fr.y.toFixed(4)},${fr.w.toFixed(4)},${fr.h.toFixed(4)}`}
                  tabIndex={0}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onKeyDown={onKeyDown}
                  aria-label="Zone de cadrage : faites glisser la photo, ou utilisez les flèches du clavier"
                  className="relative overflow-hidden rounded-2xl bg-[#1b1418] cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-[#8f6075] mx-auto md:mx-0"
                  style={{ width: frameW, height: frameH, touchAction: "none" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayUrl}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      maxWidth: "none",
                      width: imgW * scale,
                      height: imgH * scale,
                      transform: `translate(${-rect.x * scale}px, ${-rect.y * scale}px)`,
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                  />
                  {guides && (
                    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                      <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-white/80" />
                      <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-white/80" />
                      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90" />
                    </div>
                  )}
                </div>

                {/* ----- Zoom ----- */}
                <div className="flex items-center gap-2 mt-3" style={{ width: frameW }}>
                  <button
                    type="button"
                    onClick={() => applyView(zoom / 1.15, center.x, center.y)}
                    className="h-8 w-8 shrink-0 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-lg leading-none"
                    aria-label="Dézoomer"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={100}
                    max={MAX_ZOOM * 100}
                    step={1}
                    value={Math.round(zoom * 100)}
                    onChange={(e) => applyView(Number(e.target.value) / 100, center.x, center.y)}
                    aria-label="Zoom"
                    className="flex-1 min-w-0 accent-[#8f6075]"
                  />
                  <button
                    type="button"
                    onClick={() => applyView(zoom * 1.15, center.x, center.y)}
                    className="h-8 w-8 shrink-0 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-lg leading-none"
                    aria-label="Zoomer"
                  >
                    +
                  </button>
                  <span className="w-12 text-right text-xs text-[#8b737e] tabular-nums">{Math.round(zoom * 100)} %</span>
                </div>

                <div className="flex items-center justify-between mt-2 text-xs" style={{ width: frameW }}>
                  <label className="flex items-center gap-2 text-[#70656a]">
                    <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} className="h-3.5 w-3.5" />
                    Repère de centre
                  </label>
                  <button
                    type="button"
                    onClick={() => applyView(1, imgW / 2, imgH / 2)}
                    className="text-[#8f6075] underline"
                  >
                    Recentrer
                  </button>
                </div>

                <p className="text-[11px] text-[#8b737e] mt-3 leading-4" style={{ width: frameW }}>
                  Cadrage : {Math.round(rect.w)} × {Math.round(rect.h)} px dans la photo d&apos;origine → fichier enregistré{" "}
                  {out.width} × {out.height} px.
                </p>
                {lowRes && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2 leading-4" style={{ width: frameW }} role="status">
                    Zoom élevé : cette partie de la photo contient peu de pixels, elle risque d&apos;être floue sur un écran
                    haute définition.
                  </p>
                )}
              </div>

              {/* ----- Aperçus dans les vues du site ----- */}
              <div>
                <div className="text-xs uppercase tracking-widest text-[#9a7384] mb-2">Aperçu dans le site</div>
                <div className="flex flex-wrap gap-x-4 gap-y-3">
                  {views.map((v) => {
                    const b = v.frac === null ? null : badgeFor(v.frac);
                    return (
                      <div key={v.key}>
                        <canvas
                          ref={(el) => {
                            canvasRefs.current[v.key] = el;
                          }}
                          width={v.w}
                          height={v.h}
                          data-testid={`preview-${v.key}`}
                          className={`bg-[#f5edf1] border border-[#eadfe4] ${v.circle ? "rounded-full" : "rounded-lg"}`}
                          style={{ width: v.w * PREVIEW_SCALE, height: v.h * PREVIEW_SCALE }}
                        />
                        <div className="text-[11px] text-[#54434c] mt-1">{v.label}</div>
                        {b && (
                          <span data-testid={`badge-${v.key}`} className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${b.style}`}>
                            {b.text}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
                  Le site recadre la photo au centre dans les vues plus étroites : un produit bien centré reste centré partout.
                  Les indications « filigrane » concernent le filigrane enregistré dans le fichier.
                </p>
              </div>
            </div>
          )}

          {/* ----- Actions ----- */}
          <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 mt-5 px-5 sm:px-6 py-3 bg-white/95 backdrop-blur border-t border-[#f0e6ea] flex flex-wrap gap-2">
            <button
              type="button"
              onClick={validate}
              disabled={!ready}
              className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm font-medium disabled:opacity-50"
            >
              Valider le cadrage
            </button>
            <button
              type="button"
              onClick={() => onResult({ action: "whole" })}
              disabled={!ready}
              className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-11 text-sm disabled:opacity-50"
            >
              Garder la photo entière
            </button>
            <button
              type="button"
              onClick={() => onResult({ action: "skip" })}
              className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-11 text-sm"
            >
              Ignorer cette photo
            </button>
            {total > 1 && (
              <button
                type="button"
                onClick={() => onResult({ action: "cancel" })}
                className="rounded-full px-3 h-11 text-sm text-[#8f6075] underline"
              >
                Tout annuler
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
