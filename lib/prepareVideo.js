// ============================================================
// prepareVideo.js - Prepare une video avant son envoi depuis /admin
//
//  - recadre la video selon le cadrage choisi dans la fenetre de cadrage
//    (sans cadrage : la video entiere est conservee)
//  - reduit la taille (720p au maximum, jamais agrandie)
//  - ajoute le filigrane "(c) 2026 ZENORIA" (fichier public/filigrane.png)
//    en bas a gauche de la video RECADREE
//  - supprime le son et toutes les metadonnees
//  - compresse (environ 2 Mbit/s) et limite a 30 images par seconde
//
// COMMENT CA MARCHE : le navigateur LIT la video, dessine chaque image recadree
// (avec le filigrane) dans un canvas, et l'enregistre avec MediaRecorder. Aucune
// bibliotheque externe n'est necessaire. Le traitement se fait donc EN TEMPS REEL :
// une video de 20 s demande environ 20 s. Il faut garder l'onglet visible.
//
// Format de sortie : MP4 (H.264) si le navigateur sait l'enregistrer (Chrome et
// Edge recents), sinon WebM. L'original n'est pas envoye.
// ============================================================

import { loadWatermarkBitmap, watermarkBox } from "./prepareImage";
import { MAX_VIDEO_SECONDS, clamp, videoOutputSize, videoBitrate } from "./cropMath";

const WATERMARK_URL = "/filigrane.png";
const MAX_FPS = 30;          // images par seconde enregistrees (au maximum)
const STALL_MS = 8000;       // sans nouvelle image pendant 8 s : le traitement est considere bloque
const SETUP_TIMEOUT_MS = 12000;

export { MAX_VIDEO_SECONDS };

// Formats d'enregistrement, par ordre de preference. Le MP4 (H.264) se lit partout,
// y compris sur iPhone ; le WebM est le repli.
export const RECORDER_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01F",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

// Le navigateur sait-il traiter une video ? Renvoie { ok, mime } ou { ok: false, reason }.
export function videoSupport() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, reason: "Le traitement des vidéos se fait dans le navigateur." };
  }
  if (typeof MediaRecorder === "undefined") {
    return { ok: false, reason: "Ce navigateur ne permet pas d'enregistrer de vidéo. Utilisez Chrome ou Edge." };
  }
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") {
    return { ok: false, reason: "Ce navigateur ne permet pas de traiter les vidéos. Utilisez Chrome ou Edge." };
  }
  if (typeof HTMLVideoElement === "undefined" || !("requestVideoFrameCallback" in HTMLVideoElement.prototype)) {
    return { ok: false, reason: "Ce navigateur est trop ancien pour traiter les vidéos. Utilisez une version récente de Chrome ou Edge." };
  }
  const mime = RECORDER_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) {
    return { ok: false, reason: "Ce navigateur ne sait enregistrer aucun format vidéo utilisable." };
  }
  return { ok: true, mime };
}

function abortError() {
  const e = new Error("Traitement annulé.");
  e.name = "AbortError";
  return e;
}

function validCrop(crop) {
  return (
    crop &&
    [crop.x, crop.y, crop.w, crop.h].every((v) => typeof v === "number" && Number.isFinite(v)) &&
    crop.w > 0 &&
    crop.h > 0
  );
}

// Attend un evenement, avec un delai maximal.
function waitFor(target, type, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      target.removeEventListener(type, onEvent);
      reject(new Error(message));
    }, timeoutMs);
    function onEvent() {
      clearTimeout(t);
      resolve();
    }
    target.addEventListener(type, onEvent, { once: true });
  });
}

// Charge la video (sans la lire) et attend ses metadonnees.
export function loadVideoElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    const timer = setTimeout(() => fail(), SETUP_TIMEOUT_MS);
    const fail = () => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "La vidéo « " + file.name + " » n'a pas pu être lue par ce navigateur (format non pris en charge, par exemple HEVC / H.265). Convertissez-la en MP4 (H.264)."
        )
      );
    };
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      resolve({ video, url });
    };
    video.onerror = fail;
    video.src = url;
  });
}

// S'assure que la premiere image est disponible et que la lecture est au debut.
async function rewindToStart(video) {
  if (video.readyState < 2) {
    await waitFor(video, "loadeddata", SETUP_TIMEOUT_MS, "La vidéo ne se charge pas. Réessayez.");
  }
  if (video.currentTime !== 0) {
    const seeked = waitFor(video, "seeked", SETUP_TIMEOUT_MS, "La vidéo ne se positionne pas au début. Réessayez.");
    video.currentTime = 0;
    await seeked;
  }
}

// ============================================================
// Reparation de la duree d'un WebM
// MediaRecorder ecrit des fichiers WebM sans duree : le navigateur croit alors
// que la video est infinie (barre de progression inutilisable). On ajoute la duree
// dans l'en-tete du fichier. Sans effet sur le MP4.
// ============================================================
const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_DURATION = 0x4489;
const ID_TIMECODE_SCALE = 0x2ad7b1;

function readId(b, pos) {
  const first = b[pos];
  if (!first) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 4 && !(first & mask)) {
    mask >>= 1;
    len++;
  }
  if (len > 4) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + b[pos + i];
  return { id, len };
}

function readSize(b, pos) {
  const first = b[pos];
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    mask >>= 1;
    len++;
  }
  if (len > 8 || first === undefined) return null;
  let value = first & (mask - 1);
  let allOnes = value === mask - 1;
  for (let i = 1; i < len; i++) {
    const v = b[pos + i];
    value = value * 256 + v;
    if (v !== 0xff) allOnes = false;
  }
  return { value, len, unknown: allOnes };
}

function encodeSize(n, minLen = 1) {
  let len = minLen;
  while (n >= Math.pow(2, 7 * len) - 1) len++;
  const out = new Uint8Array(len);
  let v = n;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] |= 1 << (8 - len);
  return out;
}

export async function fixWebmDuration(blob, durationMs) {
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let pos = 0;
    const ebml = readId(buf, pos);
    if (!ebml || ebml.id !== ID_EBML) return blob;
    const ebmlSize = readSize(buf, pos + ebml.len);
    pos += ebml.len + ebmlSize.len + ebmlSize.value;

    const seg = readId(buf, pos);
    if (!seg || seg.id !== ID_SEGMENT) return blob;
    const segSizePos = pos + seg.len;
    const segSize = readSize(buf, segSizePos);
    pos = segSizePos + segSize.len;
    const segEnd = segSize.unknown ? buf.length : Math.min(buf.length, pos + segSize.value);

    while (pos < segEnd) {
      const idr = readId(buf, pos);
      if (!idr) return blob;
      const szr = readSize(buf, pos + idr.len);
      if (!szr) return blob;
      const hdr = idr.len + szr.len;

      if (idr.id === ID_INFO) {
        const bodyStart = pos + hdr;
        const bodyEnd = bodyStart + szr.value;
        let p = bodyStart;
        let scale = 1000000;
        let hasDuration = false;
        while (p < bodyEnd) {
          const cid = readId(buf, p);
          if (!cid) return blob;
          const csz = readSize(buf, p + cid.len);
          if (!csz) return blob;
          const cStart = p + cid.len + csz.len;
          if (cid.id === ID_DURATION) {
            const view = new DataView(buf.buffer, buf.byteOffset + cStart, csz.value);
            const v = csz.value === 8 ? view.getFloat64(0) : csz.value === 4 ? view.getFloat32(0) : 0;
            if (v > 0) hasDuration = true;
          } else if (cid.id === ID_TIMECODE_SCALE) {
            let s = 0;
            for (let i = 0; i < csz.value; i++) s = s * 256 + buf[cStart + i];
            if (s > 0) scale = s;
          }
          p = cStart + csz.value;
        }
        if (hasDuration) return blob; // la duree est deja la

        const durationEl = new Uint8Array(11);
        durationEl[0] = 0x44;
        durationEl[1] = 0x89;
        durationEl[2] = 0x88; // taille 8
        new DataView(durationEl.buffer).setFloat64(3, (durationMs * 1000000) / scale);

        const body = new Uint8Array(szr.value + durationEl.length);
        body.set(buf.subarray(bodyStart, bodyEnd), 0);
        body.set(durationEl, szr.value);
        const newHeader = new Uint8Array([...buf.subarray(pos, pos + idr.len), ...encodeSize(body.length)]);
        const delta = newHeader.length + body.length - (hdr + szr.value);

        const head = buf.slice(0, pos);
        if (!segSize.unknown) {
          const enc = encodeSize(segSize.value + delta, segSize.len);
          if (enc.length !== segSize.len) return blob; // la taille ne tient plus : on ne touche a rien
          head.set(enc, segSizePos);
        }
        return new Blob([head, newHeader, body, buf.subarray(bodyEnd)], { type: blob.type });
      }

      if (szr.unknown) return blob;
      pos += hdr + szr.value;
    }
  } catch (e) {
    // fichier inattendu : on le laisse tel quel
  }
  return blob;
}

// ============================================================
// Traitement d'une video
//  options.crop       { x, y, w, h } en fractions (0 a 1) de la video, ou rien pour la video entiere
//  options.onProgress ({ fraction, seconds, duration }) appelee pendant le traitement
//  options.signal     AbortSignal pour annuler
//  options.watermark  false pour ne pas ajouter le filigrane
// Renvoie { file, width, height, duration, mimeType, bitrate, fps, smooth }.
//  fps    : images enregistrees par seconde
//  smooth : false si trop d'images ont ete perdues (PC trop lent) : la video risque de saccader
// ============================================================
export async function prepareVideoForWeb(file, options = {}) {
  const { crop, onProgress, signal } = options;
  const withWatermark = options.watermark !== false;
  const watermarkUrl = options.watermarkUrl || WATERMARK_URL;

  const support = videoSupport();
  if (!support.ok) throw new Error(support.reason);
  const mime =
    options.mimeType && MediaRecorder.isTypeSupported(options.mimeType) ? options.mimeType : support.mime;

  if (signal && signal.aborted) throw abortError();

  // Le filigrane en premier : s'il manque, on le dit avant tout traitement.
  const wm = withWatermark ? await loadWatermarkBitmap(watermarkUrl) : null;
  if (signal && signal.aborted) throw abortError();

  const { video, url } = await loadVideoElement(file);
  let stream = null;

  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const duration = video.duration;
    if (!vw || !vh) throw new Error("La vidéo ne contient aucune image lisible.");
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("La durée de cette vidéo n'a pas pu être lue.");
    if (duration > MAX_VIDEO_SECONDS) {
      throw new Error(
        "La vidéo dure " + Math.round(duration) + " s (maximum " + MAX_VIDEO_SECONDS + " s). Raccourcissez-la avant de l'ajouter."
      );
    }

    // Zone decoupee dans la video d'origine
    const c = validCrop(crop) ? crop : { x: 0, y: 0, w: 1, h: 1 };
    const sx = clamp(c.x * vw, 0, vw - 2);
    const sy = clamp(c.y * vh, 0, vh - 2);
    const sw = clamp(c.w * vw, 2, vw - sx);
    const sh = clamp(c.h * vh, 2, vh - sy);

    const out = videoOutputSize(sw, sh);
    const box = wm ? watermarkBox(out.width, out.height, wm, "bas-gauche") : null;
    const bitrate = videoBitrate(out.width, out.height, MAX_FPS);

    const canvas = document.createElement("canvas");
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium"; // « high » est trop lent pour du temps reel sur un PC modeste

    stream = canvas.captureStream(0); // une image n'est enregistree que lorsqu'on la demande
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });

    let drawnCount = 0; // images enregistrees
    const draw = () => {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, out.width, out.height);
      if (wm) ctx.drawImage(wm, box.x, box.y, box.wmW, box.wmH);
      if (track && typeof track.requestFrame === "function") track.requestFrame();
    };

    await rewindToStart(video);
    if (signal && signal.aborted) throw abortError();
    video.loop = false;
    video.muted = true;

    const recording = await new Promise((resolve, reject) => {
      const chunks = [];
      let settled = false;
      let ending = false;
      let rvfcId = 0;
      let lastFrameAt = performance.now();
      let lastDrawn = -1;
      let endTimer = 0;
      let presented = 0; // images presentees par le navigateur (meme celles qu'on n'a pas pu dessiner)

      const stopEverything = () => {
        clearInterval(watchdog);
        clearTimeout(endTimer);
        document.removeEventListener("visibilitychange", onVisibility);
        if (signal) signal.removeEventListener("abort", onAbort);
        video.removeEventListener("ended", onEnded);
        try {
          if (rvfcId && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(rvfcId);
        } catch (e) {
          // sans importance
        }
        try {
          video.pause();
        } catch (e) {
          // sans importance
        }
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        stopEverything();
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch (e) {
          // sans importance
        }
        reject(err);
      };
      const onAbort = () => fail(abortError());
      const onVisibility = () => {
        if (document.hidden) {
          fail(
            new Error(
              "Le traitement a été interrompu car l'onglet a été masqué. Gardez cet onglet visible pendant le traitement, puis recommencez."
            )
          );
        }
      };
      const watchdog = setInterval(() => {
        if (performance.now() - lastFrameAt > STALL_MS) {
          fail(new Error("Le traitement de la vidéo est bloqué. Fermez les autres onglets lourds et recommencez."));
        }
      }, 1000);

      const onFrame = (now, meta) => {
        if (settled || ending) return;
        lastFrameAt = performance.now();
        const t = meta && typeof meta.mediaTime === "number" ? meta.mediaTime : video.currentTime;
        if (meta && typeof meta.presentedFrames === "number") presented = Math.max(presented, meta.presentedFrames);
        if (lastDrawn < 0 || t - lastDrawn >= 1 / (MAX_FPS + 1)) {
          draw();
          drawnCount++;
          lastDrawn = t;
        }
        if (onProgress) onProgress({ fraction: clamp(t / duration, 0, 1), seconds: t, duration });
        rvfcId = video.requestVideoFrameCallback(onFrame);
      };

      const onEnded = () => {
        if (settled || ending) return;
        ending = true;
        draw(); // derniere image
        drawnCount++;
        if (onProgress) onProgress({ fraction: 1, seconds: duration, duration });
        // court delai pour laisser l'encodeur recevoir la derniere image
        endTimer = setTimeout(() => {
          try {
            recorder.stop();
          } catch (e) {
            fail(new Error("L'enregistrement de la vidéo n'a pas pu être terminé."));
          }
        }, 100);
      };

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => fail(new Error("L'enregistrement de la vidéo a échoué."));
      recorder.onstop = () => {
        if (settled || !ending) return;
        settled = true;
        stopEverything();
        resolve({ chunks, presented });
      };

      document.addEventListener("visibilitychange", onVisibility);
      if (signal) signal.addEventListener("abort", onAbort);
      video.addEventListener("ended", onEnded);

      if (document.hidden) {
        onVisibility();
        return;
      }

      try {
        draw(); // premiere image
        lastDrawn = video.currentTime || 0;
        recorder.start();
        rvfcId = video.requestVideoFrameCallback(onFrame);
        const playing = video.play();
        if (playing && typeof playing.catch === "function") {
          playing.catch(() =>
            fail(new Error("Le navigateur a refusé de lire la vidéo. Cliquez dans la page puis recommencez."))
          );
        }
      } catch (e) {
        fail(new Error("Le traitement de la vidéo n'a pas pu démarrer : " + ((e && e.message) || e)));
      }
    });

    const baseType = mime.split(";")[0];
    let blob = new Blob(recording.chunks, { type: baseType });
    if (blob.size === 0) throw new Error("La vidéo traitée est vide. Recommencez.");
    if (baseType === "video/webm") blob = await fixWebmDuration(blob, Math.round(duration * 1000));

    const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
    const extension = baseType === "video/webm" ? ".webm" : ".mp4";
    // Fluidite : images enregistrees par seconde, comparees a ce que la video source offrait (30 i/s au maximum).
    const sourceFps = recording.presented > 0 ? recording.presented / duration : MAX_FPS;
    const expectedFps = Math.min(MAX_FPS, sourceFps);
    const fps = drawnCount / duration;
    return {
      file: new File([blob], baseName + extension, { type: baseType }),
      width: out.width,
      height: out.height,
      duration,
      mimeType: baseType,
      bitrate,
      fps: Math.round(fps * 10) / 10,
      smooth: fps >= expectedFps * 0.75,
    };
  } finally {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (e) {
      // sans importance
    }
    URL.revokeObjectURL(url);
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
}
