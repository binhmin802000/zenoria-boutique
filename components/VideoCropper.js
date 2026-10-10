import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause } from "lucide-react";
import { loadWatermarkBitmap, watermarkBox } from "@/lib/prepareImage";
import { prepareVideoForWeb, videoSupport } from "@/lib/prepareVideo";
import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  FRAME_ASPECT,
  MAX_ZOOM,
  MIN_SOURCE_WIDTH_WARN,
  MAX_VIDEO_SECONDS,
  clamp,
  cropRect,
  toFractions,
  videoOutputSize,
  visibleFraction,
} from "@/lib/cropMath";

// ============================================================
// VideoCropper - fenetre de cadrage et de traitement d'une video avant son envoi
//
// Etape 1 - CADRAGE : la video est lue dans le CADRE REEL DE LA FICHE PRODUIT du
//           site (448 x 360). On la fait glisser pour centrer la bague, et on regle
//           le zoom. Des apercus montrent le rendu dans les autres vues du site.
// Etape 2 - TRAITEMENT : le navigateur recadre la video, ajoute le filigrane
//           « © 2026 ZENORIA » en bas a gauche, supprime le son, reduit en 720p et
//           compresse. Cela se fait en temps reel (voir lib/prepareVideo.js).
// Etape 3 - VERIFICATION : on regarde la video traitee avant de l'utiliser.
//
// Le composant renvoie son resultat a la page d'administration par onResult :
//   { action: "use", file }  video traitee, prete a etre envoyee
//   { action: "skip" }       ignorer cette video
//   { action: "cancel" }     tout annuler
// ============================================================

// Vues du site dans lesquelles la video enregistree est affichee
// (dimensions reelles du site pour un ecran d'ordinateur).
const VIEWS = [
  { key: "pc", label: "Fiche produit (PC)", w: 448, h: 360 },
  { key: "mobile", label: "Fiche produit (mobile)", w: 358, h: 360 },
  { key: "circle", label: "Cercle (bannière, 1ʳᵉ collection)", w: 420, h: 420, circle: true },
];
const PREVIEW_SCALE = 0.4; // les aperçus sont affichés à 40 % de leur taille réelle

const SCRIPT_HINT = " Vous pouvez aussi préparer la vidéo avec le script scripts/preparer-medias.mjs.";

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

function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function formatSize(bytes) {
  if (bytes < 1048576) return Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR") + " Ko";
  return (bytes / 1048576).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " Mo";
}

export default function VideoCropper({ file, onResult }) {
  const [step, setStep] = useState("loading"); // loading | frame | processing | review | error
  const [error, setError] = useState({ message: "", fatal: false });
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState(null); // { w, h, duration }
  const [wm, setWm] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState(true);
  const [frameW, setFrameW] = useState(FRAME_WIDTH);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [progress, setProgress] = useState({ fraction: 0, seconds: 0 });
  const [result, setResult] = useState(null);

  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const canvasRefs = useRef({});
  const offRef = useRef(null);
  const abortRef = useRef(null);
  const lastCropRef = useRef(null);
  const lastProgressAt = useRef(0);
  const resultUrlRef = useRef("");
  const latest = useRef({});

  // ---- Chargement : navigateur compatible, filigrane, adresse locale de la video ----
  useEffect(() => {
    const support = videoSupport();
    if (!support.ok) {
      setError({ message: support.reason + SCRIPT_HINT, fatal: true });
      setStep("error");
      return undefined;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    let cancelled = false;
    loadWatermarkBitmap()
      .then((w) => {
        if (!cancelled) setWm(w);
      })
      .catch((e) => {
        if (!cancelled) {
          setError({ message: (e && e.message) || "Le filigrane est introuvable.", fatal: true });
          setStep("error");
        }
      });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(u);
    };
  }, [file]);

  // ---- Nettoyage à la fermeture ----
  useEffect(
    () => () => {
      if (abortRef.current) abortRef.current.abort();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    []
  );

  const onMetadata = (e) => {
    const v = e.currentTarget;
    if (!v.videoWidth || !v.videoHeight || !Number.isFinite(v.duration)) {
      setError({ message: "Cette vidéo ne contient aucune image lisible.", fatal: true });
      setStep("error");
      return;
    }
    if (v.duration > MAX_VIDEO_SECONDS) {
      setError({
        message: "La vidéo dure " + Math.round(v.duration) + " s (maximum " + MAX_VIDEO_SECONDS + " s). Raccourcissez-la avant de l'ajouter.",
        fatal: true,
      });
      setStep("error");
      return;
    }
    setMeta({ w: v.videoWidth, h: v.videoHeight, duration: v.duration });
    setCenter({ x: v.videoWidth / 2, y: v.videoHeight / 2 });
  };

  const onVideoError = () => {
    setError({
      message:
        "La vidéo « " + file.name + " » n'a pas pu être lue par ce navigateur (format non pris en charge, par exemple HEVC / H.265). Convertissez-la en MP4 (H.264)." +
        SCRIPT_HINT,
      fatal: true,
    });
    setStep("error");
  };

  const ready = Boolean(meta && wm);
  useEffect(() => {
    if (ready && step === "loading") setStep("frame");
  }, [ready, step]);

  // Lecture automatique (muette) quand le cadrage est affiché
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (step === "frame" && ready) {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      v.pause();
    }
  }, [step, ready]);

  // ---- Largeur du cadre : 448 px au maximum, réduite sur petit écran ----
  useEffect(() => {
    const update = () => setFrameW(Math.max(240, Math.min(FRAME_WIDTH, window.innerWidth - 72)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const imgW = meta ? meta.w : 1;
  const imgH = meta ? meta.h : 1;
  const rect = ready ? cropRect(imgW, imgH, FRAME_ASPECT, zoom, center.x, center.y) : null;
  const frameH = frameW / FRAME_ASPECT;
  const scale = rect ? frameW / rect.w : 1; // pixels d'écran par pixel de la vidéo

  latest.current = { zoom, center, imgW, imgH, ready, rect, wm };

  const applyView = (nextZoom, cx, cy) => {
    const z = clamp(nextZoom, 1, MAX_ZOOM);
    const r = cropRect(imgW, imgH, FRAME_ASPECT, z, cx, cy);
    setZoom(z);
    setCenter({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  };

  // ---- Glisser pour déplacer la vidéo ----
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
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      v.pause();
    }
  };

  // ---- Clavier : flèches pour déplacer, + et - pour zoomer, espace pour lire / mettre en pause ----
  const onKeyDown = (e) => {
    if (!ready || !rect) return;
    const step_ = rect.w * 0.03;
    if (e.key === "ArrowLeft") applyView(zoom, center.x - step_, center.y);
    else if (e.key === "ArrowRight") applyView(zoom, center.x + step_, center.y);
    else if (e.key === "ArrowUp") applyView(zoom, center.x, center.y - step_);
    else if (e.key === "ArrowDown") applyView(zoom, center.x, center.y + step_);
    else if (e.key === "+" || e.key === "=") applyView(zoom * 1.1, center.x, center.y);
    else if (e.key === "-") applyView(zoom / 1.1, center.x, center.y);
    else if (e.key === " ") togglePlay();
    else return;
    e.preventDefault();
  };

  // ---- Taille du fichier enregistré et position du filigrane ----
  const out = rect ? videoOutputSize(rect.w, rect.h) : null;
  const box = out && wm ? watermarkBox(out.width, out.height, wm, "bas-gauche") : null;
  const views = useMemo(() => {
    if (!out || !box) return VIEWS.map((v) => ({ ...v, frac: null }));
    return VIEWS.map((v) => ({
      ...v,
      frac: visibleFraction(box, out.width, out.height, v.w, v.h, Boolean(v.circle)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out && out.width, out && out.height, box && box.x, box && box.y, box && box.wmW]);

  // ---- Aperçus en direct (vidéo recadrée + filigrane, dans chaque vue du site) ----
  const drawPreviews = () => {
    const st = latest.current;
    const v = videoRef.current;
    if (!st.rect || !st.wm || !v || v.readyState < 2) return;
    let off = offRef.current;
    if (!off) {
      off = document.createElement("canvas");
      off.width = FRAME_WIDTH;
      off.height = FRAME_HEIGHT;
      offRef.current = off;
    }
    const octx = off.getContext("2d");
    octx.drawImage(v, st.rect.x, st.rect.y, st.rect.w, st.rect.h, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const o = videoOutputSize(st.rect.w, st.rect.h);
    const b = watermarkBox(o.width, o.height, st.wm, "bas-gauche");
    const k = FRAME_WIDTH / o.width;
    octx.drawImage(st.wm, b.x * k, b.y * k, b.wmW * k, b.wmH * k);
    VIEWS.forEach((view) => {
      const canvas = canvasRefs.current[view.key];
      if (canvas) drawCover(canvas, off, view.w, view.h);
    });
  };

  // Rafraîchit les aperçus à chaque image de la vidéo, et après un déplacement ou un saut dans le temps
  useEffect(() => {
    if (step !== "frame" || !ready) return undefined;
    const v = videoRef.current;
    if (!v) return undefined;
    let stopped = false;
    let id = 0;
    const tick = () => {
      if (stopped) return;
      drawPreviews();
      id = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    tick();
    const refresh = () => drawPreviews();
    v.addEventListener("seeked", refresh);
    v.addEventListener("pause", refresh);
    v.addEventListener("loadeddata", refresh);
    return () => {
      stopped = true;
      v.removeEventListener("seeked", refresh);
      v.removeEventListener("pause", refresh);
      v.removeEventListener("loadeddata", refresh);
      if (v.cancelVideoFrameCallback && id) v.cancelVideoFrameCallback(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ready]);

  useEffect(() => {
    if (step !== "frame" || !ready) return undefined;
    const id = requestAnimationFrame(drawPreviews);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ready, rect && rect.x, rect && rect.y, rect && rect.w, rect && rect.h]);

  // ---- Traitement ----
  const startProcessing = async (crop) => {
    const v = videoRef.current;
    if (v) v.pause();
    lastCropRef.current = crop;
    const controller = new AbortController();
    abortRef.current = controller;
    lastProgressAt.current = 0;
    setProgress({ fraction: 0, seconds: 0 });
    setStep("processing");
    try {
      const res = await prepareVideoForWeb(file, {
        crop,
        signal: controller.signal,
        onProgress: (p) => {
          const now = performance.now();
          if (now - lastProgressAt.current > 120 || p.fraction >= 1) {
            lastProgressAt.current = now;
            setProgress(p);
          }
        },
      });
      if (controller.signal.aborted) return;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const resultUrl = URL.createObjectURL(res.file);
      resultUrlRef.current = resultUrl;
      setResult({ ...res, url: resultUrl });
      setStep("review");
    } catch (e) {
      if (e && e.name === "AbortError") {
        setStep("frame");
        return;
      }
      setError({ message: (e && e.message) || "Le traitement de la vidéo a échoué.", fatal: false });
      setStep("error");
    } finally {
      abortRef.current = null;
    }
  };

  const cancelProcessing = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const validate = () => {
    if (!rect) return;
    startProcessing(toFractions(rect, imgW, imgH));
  };

  const closeAll = () => {
    if (abortRef.current) abortRef.current.abort();
    onResult({ action: "cancel" });
  };

  const useResult = () => {
    if (result) onResult({ action: "use", file: result.file });
  };

  const lowRes = Boolean(rect && rect.w < MIN_SOURCE_WIDTH_WARN);
  const fr = rect ? toFractions(rect, imgW, imgH) : null;
  const percent = Math.round((progress.fraction || 0) * 100);
  const duration = meta ? meta.duration : 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/55 z-50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cadrer la vidéo"
        className="fixed z-50 inset-x-3 top-[3%] max-w-4xl mx-auto bg-white rounded-[2rem] shadow-2xl max-h-[94vh] overflow-y-auto"
      >
        <div className="p-5 sm:p-6">
          <div className="flex justify-between items-start gap-3 mb-2">
            <div className="min-w-0">
              <h2 className="font-serif text-2xl">
                {step === "processing" ? "Traitement de la vidéo" : step === "review" ? "Vérifier la vidéo" : "Cadrer la vidéo"}
              </h2>
              <p className="text-xs text-[#8b737e] truncate">
                {file.name}
                {meta ? ` · ${meta.w} × ${meta.h} px · ${formatClock(meta.duration)}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={closeAll}
              className="h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-[#f0e6ea]"
              aria-label="Tout annuler"
              title="Tout annuler"
            >
              <X size={18} />
            </button>
          </div>

          {step === "loading" && <p className="text-sm text-[#8b737e] py-10 text-center">Chargement de la vidéo...</p>}

          {step === "error" && (
            <div className="rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm my-4 leading-5" role="alert">
              {error.message}
            </div>
          )}

          {/* ----- Etape 1 : cadrage (reste dans la page, masqué aux autres étapes, pour conserver la vidéo chargée) ----- */}
          <div className={step === "frame" ? "" : "hidden"}>
            <p className="text-sm text-[#70656a] mb-4 leading-5">
              Faites glisser la vidéo pour centrer la bague, puis réglez le zoom. La vidéo enregistrée sera exactement ce
              cadre, sans le son, avec le filigrane « © 2026 ZENORIA » en bas à gauche. Durée maximale : {MAX_VIDEO_SECONDS} s.
            </p>
            <div className="grid md:grid-cols-[auto_1fr] gap-6">
              <div>
                <div
                  ref={frameRef}
                  data-testid="crop-frame"
                  data-crop={fr ? `${fr.x.toFixed(4)},${fr.y.toFixed(4)},${fr.w.toFixed(4)},${fr.h.toFixed(4)}` : ""}
                  tabIndex={0}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onKeyDown={onKeyDown}
                  aria-label="Zone de cadrage : faites glisser la vidéo, ou utilisez les flèches du clavier"
                  className="relative overflow-hidden rounded-2xl bg-[#1b1418] cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-[#8f6075] mx-auto md:mx-0"
                  style={{ width: frameW, height: frameH, touchAction: "none" }}
                >
                  {url && (
                    <video
                      ref={videoRef}
                      src={url}
                      muted
                      loop
                      playsInline
                      preload="auto"
                      onLoadedMetadata={onMetadata}
                      onError={onVideoError}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                      data-testid="source-video"
                      style={
                        rect
                          ? {
                              position: "absolute",
                              left: 0,
                              top: 0,
                              maxWidth: "none",
                              width: imgW * scale,
                              height: imgH * scale,
                              transform: `translate(${-rect.x * scale}px, ${-rect.y * scale}px)`,
                              userSelect: "none",
                              pointerEvents: "none",
                            }
                          : { position: "absolute", width: 2, height: 2, opacity: 0, pointerEvents: "none" }
                      }
                    />
                  )}
                  {guides && (
                    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                      <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-white/80" />
                      <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-white/80" />
                      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90" />
                    </div>
                  )}
                </div>

                {/* ----- Lecture ----- */}
                <div className="flex items-center gap-2 mt-3" style={{ width: frameW }}>
                  <button
                    type="button"
                    onClick={togglePlay}
                    data-testid="play-toggle"
                    className="h-8 w-8 shrink-0 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1]"
                    aria-label={playing ? "Mettre la vidéo en pause" : "Lire la vidéo"}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.round(duration * 100))}
                    step={1}
                    value={Math.round(time * 100)}
                    onChange={(e) => {
                      const v = videoRef.current;
                      if (v) v.currentTime = Number(e.target.value) / 100;
                      setTime(Number(e.target.value) / 100);
                    }}
                    aria-label="Position dans la vidéo"
                    data-testid="scrubber"
                    className="flex-1 min-w-0 accent-[#8f6075]"
                  />
                  <span className="w-[92px] shrink-0 whitespace-nowrap text-right text-xs text-[#8b737e] tabular-nums">
                    {formatClock(time)} / {formatClock(duration)}
                  </span>
                </div>

                {/* ----- Zoom ----- */}
                <div className="flex items-center gap-2 mt-2" style={{ width: frameW }}>
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
                  <button type="button" onClick={() => applyView(1, imgW / 2, imgH / 2)} className="text-[#8f6075] underline">
                    Recentrer
                  </button>
                </div>

                {rect && out && (
                  <p className="text-[11px] text-[#8b737e] mt-3 leading-4" style={{ width: frameW }}>
                    Cadrage : {Math.round(rect.w)} × {Math.round(rect.h)} px dans la vidéo d&apos;origine → vidéo enregistrée{" "}
                    {out.width} × {out.height} px, sans le son.
                  </p>
                )}
                {lowRes && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2 leading-4" style={{ width: frameW }} role="status">
                    Zoom élevé : cette partie de la vidéo contient peu de pixels, elle risque d&apos;être floue sur un écran
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
                  Le site recadre la vidéo au centre dans les vues plus étroites : un produit bien centré reste centré partout.
                  Faites défiler la vidéo avec la barre de lecture pour vérifier le cadrage à différents moments. Les
                  indications « filigrane » concernent le filigrane enregistré dans le fichier.
                </p>
              </div>
            </div>
          </div>

          {/* ----- Etape 2 : traitement ----- */}
          {step === "processing" && (
            <div className="py-6" data-testid="processing">
              <p className="text-sm text-[#54434c] mb-3 leading-5">
                La vidéo est recadrée, compressée et filigranée par votre navigateur. Cela se fait en temps réel : comptez à
                peu près {Math.max(1, Math.round(duration))} s. <strong>Laissez cette fenêtre ouverte et restez sur cet onglet.</strong>
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                data-testid="progress"
                className="h-3 rounded-full bg-[#f0e6ea] overflow-hidden"
              >
                <div className="h-full rounded-full bg-[#8f6075] transition-all" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex justify-between text-xs text-[#8b737e] mt-1.5 tabular-nums">
                <span>{percent} %</span>
                <span>
                  {formatClock(progress.seconds || 0)} / {formatClock(duration)}
                </span>
              </div>
            </div>
          )}

          {/* ----- Etape 3 : vérification ----- */}
          {step === "review" && result && (
            <div className="grid md:grid-cols-[auto_1fr] gap-6 mt-2" data-testid="review">
              <div>
                <video
                  src={result.url}
                  data-testid="result-video"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="rounded-2xl bg-black mx-auto md:mx-0"
                  style={{ width: Math.min(frameW, 448), aspectRatio: `${result.width} / ${result.height}`, maxHeight: 460 }}
                />
              </div>
              <div className="text-sm text-[#54434c] space-y-2" data-testid="result-info">
                <div className="text-xs uppercase tracking-widest text-[#9a7384]">Vidéo traitée</div>
                <ul className="space-y-1 text-[13px] leading-5">
                  <li>
                    Format : {result.mimeType === "video/mp4" ? "MP4 (H.264)" : "WebM"} · {result.width} × {result.height} px
                  </li>
                  <li>
                    Poids : {formatSize(result.file.size)} · Durée : {formatClock(result.duration)}
                  </li>
                  <li>Fluidité : {result.fps} images par seconde</li>
                  <li>Sans le son · filigrane « © 2026 ZENORIA » en bas à gauche</li>
                </ul>
                {!result.smooth && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-4" role="status" data-testid="not-smooth">
                    Cet ordinateur n&apos;a pas pu suivre le rythme : la vidéo risque de saccader. Fermez les autres onglets et
                    applications, puis cliquez sur « Refaire le traitement ».{SCRIPT_HINT}
                  </p>
                )}
                <p className="text-[11px] text-[#8b737e] leading-4">
                  Regardez la vidéo ci-contre : c&apos;est exactement ce qui sera enregistré sur le site.
                </p>
              </div>
            </div>
          )}

          {/* ----- Actions ----- */}
          <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 mt-5 px-5 sm:px-6 py-3 bg-white/95 backdrop-blur border-t border-[#f0e6ea] flex flex-wrap gap-2">
            {step === "frame" && (
              <>
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
                  onClick={() => startProcessing(null)}
                  disabled={!ready}
                  className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-11 text-sm disabled:opacity-50"
                >
                  Garder la vidéo entière
                </button>
                <button
                  type="button"
                  onClick={() => onResult({ action: "skip" })}
                  className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-11 text-sm"
                >
                  Ignorer cette vidéo
                </button>
              </>
            )}
            {step === "processing" && (
              <button
                type="button"
                onClick={cancelProcessing}
                className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-6 h-11 text-sm"
              >
                Annuler le traitement
              </button>
            )}
            {step === "review" && (
              <>
                <button
                  type="button"
                  onClick={useResult}
                  className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm font-medium"
                >
                  Utiliser cette vidéo
                </button>
                {result && !result.smooth && (
                  <button
                    type="button"
                    onClick={() => startProcessing(lastCropRef.current)}
                    className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-11 text-sm"
                  >
                    Refaire le traitement
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep("frame")}
                  className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-11 text-sm"
                >
                  Refaire le cadrage
                </button>
                <button
                  type="button"
                  onClick={() => onResult({ action: "skip" })}
                  className="rounded-full px-3 h-11 text-sm text-[#8f6075] underline"
                >
                  Ignorer cette vidéo
                </button>
              </>
            )}
            {step === "error" && (
              <>
                {!error.fatal && (
                  <button
                    type="button"
                    onClick={() => setStep("frame")}
                    className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm font-medium"
                  >
                    Réessayer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onResult({ action: "skip" })}
                  className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-5 h-11 text-sm"
                >
                  Ignorer cette vidéo
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
