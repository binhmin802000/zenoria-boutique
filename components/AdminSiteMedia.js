import React, { useCallback, useEffect, useState } from "react";
import { Upload, Film, Trash2, RefreshCw } from "lucide-react";
import {
  supabase,
  getMediaUrl,
  uploadSiteMedia,
  saveSiteMedia,
  clearSiteMedia,
  deleteProductMedia,
  SITE_MEDIA_TABLE,
  SITE_SLOT_HERO_VIDEO,
  SITE_SLOT_SAVOIR_FAIRE,
  SITE_SLOT_ACCOUNT_HERO, // ZENORIA_ACCOUNT_STEP12_V1
} from "@/lib/supabase";
import { WATERMARK_CIRCLE_URL } from "@/lib/prepareImage";
import { CIRCLE_ASPECT, CIRCLE_FRAME_SIZE, CIRCLE_PHOTO_MAX_SIDE, HERO_VIDEO_MAX_SECONDS } from "@/lib/cropMath";
import PhotoCropper from "@/components/PhotoCropper";
import VideoCropper from "@/components/VideoCropper";
import AdminSeasonFx from "@/components/AdminSeasonFx";
import AdminRingAnimation from "@/components/AdminRingAnimation";
import AdminShipping from "@/components/AdminShipping";
import AdminContact from "@/components/AdminContact";
import AdminLegalPages from "@/components/AdminLegalPages"; // ZENORIA_STORY_REVIEWS_V1
import AdminSiteTexts from "@/components/AdminSiteTexts";
import AdminCgv from "@/components/AdminCgv";

// ============================================================
// ONGLET « CONTENU DU SITE » de l'administration (/admin)
//
// Deux emplacements indépendants des collections :
//  - la VIDÉO de la bannière d'accueil (cercle de 420 px, en boucle, sans le son)
//  - la PHOTO de la section Savoir-faire (cercle de 380 px)
//
// Pour chacun : cadrage dans un carré (le site le découpe en cercle), traitement,
// vérification, puis envoi. Le filigrane est placé au centre, tout en bas, avec une
// ombre renforcée. Tant qu'un emplacement est vide, le site garde son comportement
// d'origine (média de la première collection).
// Voir supabase_site_media.sql pour la table et les règles de sécurité.
// ============================================================

const MAX_ORIGINAL_MB = 95; // taille maximale du fichier d'origine choisi

// Vues du site simulées dans la fenêtre de cadrage
const HERO_VIEWS = [{ key: "hero", label: "Bannière d'accueil (cercle de 420 px)", w: 420, h: 420, circle: true }];
const SAVOIR_VIEWS = [{ key: "savoir", label: "Section Savoir-faire (cercle de 380 px)", w: 380, h: 380, circle: true }];
// ZENORIA_ACCOUNT_STEP12_V1 : bandeau de l'espace cliente (/compte), format large 21:9
const ACCOUNT_HERO_ASPECT = 21 / 9;
const ACCOUNT_HERO_MAX_SIDE = 1900;
const ACCOUNT_HERO_VIEWS = [
  { key: "hero-pc", label: "Mon compte, ordinateur", w: 448, h: 192 },
  { key: "hero-mobile", label: "Mon compte, mobile", w: 280, h: 200 },
];

const SLOTS = [
  {
    slot: SITE_SLOT_HERO_VIDEO,
    kind: "video",
    title: "Vidéo de la page d'accueil",
    description: `Affichée dans le grand cercle de la bannière, en boucle et sans le son. Durée maximale : ${HERO_VIDEO_MAX_SECONDS} s.`,
    fallback: "Aucune vidéo dédiée : le site affiche la vidéo de la première collection en ligne.",
    addLabel: "Ajouter une vidéo",
    replaceLabel: "Remplacer la vidéo",
  },
  {
    slot: SITE_SLOT_SAVOIR_FAIRE,
    kind: "photo",
    title: "Photo de la section Savoir-faire",
    description: "Affichée dans le cercle à gauche du texte « Une bague, cinquante cristaux Swarovski, un geste à la main ».",
    fallback: "Aucune photo dédiée : le site affiche la première photo de la première collection en ligne.",
    addLabel: "Ajouter une photo",
    replaceLabel: "Remplacer la photo",
  },
  {
    // ZENORIA_ACCOUNT_STEP12_V1
    slot: SITE_SLOT_ACCOUNT_HERO,
    kind: "photo",
    wide: true,
    title: "Bandeau de l'espace cliente",
    description: "Affiché en haut de la page « Mon compte ». Format large ; un voile ivoire est ajouté à gauche (ordinateur) ou en bas (mobile) : placez le bijou plutôt à droite.",
    fallback: "Aucune image dédiée : la page « Mon compte » affiche l'image par défaut « Fondu lumineux ».",
    addLabel: "Ajouter une image",
    replaceLabel: "Remplacer l'image",
  },
];

const TIME_ZONE = "Europe/Paris";
function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function TraceLine({ label, at, by }) {
  const date = formatDateTime(at);
  if (!date) return null;
  return (
    <div className="leading-4">
      <span className="text-[#8b737e]">{label} </span>
      <span className="whitespace-nowrap">{date}</span>
      <span className="text-[#8b737e]"> · {by ? by : "auteur non enregistré"}</span>
    </div>
  );
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table du contenu du site n'est pas encore installée. Exécutez le script supabase_site_media.sql dans Supabase (SQL Editor).";
  }
  return msg;
}

export default function AdminSiteMedia() {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [photoRequest, setPhotoRequest] = useState(null); // { file, slot }
  const [videoRequest, setVideoRequest] = useState(null); // { id, file, slot }
  const [wideRequest, setWideRequest] = useState(null); // ZENORIA_ACCOUNT_STEP12_V1 : { file, slot } (bandeau 21:9)

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error: err } = await supabase.from(SITE_MEDIA_TABLE).select("*");
    if (err) {
      setLoadError(friendlyError(err));
    } else {
      const map = {};
      (data || []).forEach((r) => {
        map[r.slot] = r;
      });
      setRows(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Choix du fichier ----
  const onPick = (cfg) => (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (cfg.kind === "video") {
      if (!file.type.startsWith("video/")) {
        setError(`« ${file.name} » n'est pas une vidéo.`);
        return;
      }
    } else if (!file.type.startsWith("image/")) {
      setError(`« ${file.name} » n'est pas une image.`);
      return;
    }
    if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) {
      setError(`« ${file.name} » dépasse ${MAX_ORIGINAL_MB} Mo.`);
      return;
    }
    if (cfg.kind === "video") setVideoRequest({ id: Date.now(), file, slot: cfg.slot });
    else if (cfg.wide) setWideRequest({ file, slot: cfg.slot }); // ZENORIA_ACCOUNT_STEP12_V1
    else setPhotoRequest({ file, slot: cfg.slot });
  };

  // ---- Envoi : fichier traité -> stockage -> table -> suppression de l'ancien fichier ----
  const publish = async (slot, file, options) => {
    setBusy(slot);
    setError("");
    try {
      const oldPath = rows[slot] ? rows[slot].path : null;
      const path = await uploadSiteMedia(file, slot, options);
      const { error: saveErr } = await saveSiteMedia(slot, path);
      if (saveErr) {
        await deleteProductMedia(path); // on ne garde pas un fichier orphelin
        throw saveErr;
      }
      if (oldPath && oldPath !== path) deleteProductMedia(oldPath); // libère l'espace du quota
      setToast("Contenu du site mis à jour.");
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    } finally {
      setBusy("");
    }
  };

  const finishPhoto = (result) => {
    const req = photoRequest;
    setPhotoRequest(null);
    if (!req || result.action !== "crop") return;
    publish(req.slot, req.file, { crop: result.crop });
  };

  // ZENORIA_ACCOUNT_STEP12_V1 : bandeau large — recadrage 21:9, 1 900 px
  const finishWide = (result) => {
    const req = wideRequest;
    setWideRequest(null);
    if (!req || result.action !== "crop") return;
    publish(req.slot, req.file, { crop: result.crop, maxSide: ACCOUNT_HERO_MAX_SIDE });
  };
  const finishVideo = (result) => {
    const req = videoRequest;
    setVideoRequest(null);
    if (!req || result.action !== "use") return;
    publish(req.slot, result.file, {});
  };

  const remove = async (cfg) => {
    const row = rows[cfg.slot];
    if (!row) return;
    if (!window.confirm(`Retirer « ${cfg.title} » ? ${cfg.wide ? "La page Mon compte reviendra à l'image par défaut." : "Le site reviendra au média de la première collection."}`)) return;
    setBusy(cfg.slot);
    setError("");
    try {
      const { error: delErr } = await clearSiteMedia(cfg.slot);
      if (delErr) throw delErr;
      deleteProductMedia(row.path);
      setToast("Média retiré : le site utilise de nouveau la première collection.");
      await load();
    } catch (err) {
      setError("Échec de la suppression : " + friendlyError(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Contenu du site</h1>
          <p className="text-sm text-[#8b737e]">La vidéo d&apos;accueil et la photo de Savoir-faire, indépendantes des collections</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {toast && <div className="mb-5 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">{loadError}</div>}
      {error && <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">{error}</div>}

      <div className="grid md:grid-cols-2 gap-5">
        {SLOTS.map((cfg) => {
          const row = rows[cfg.slot];
          const url = row ? getMediaUrl(row.path, "site") : null;
          const working = busy === cfg.slot;
          return (
            <section key={cfg.slot} data-testid={`slot-${cfg.slot}`} className="rounded-2xl bg-white border border-[#eee2e5] p-5">
              <h2 className="font-serif text-xl">{cfg.title}</h2>
              <p className="text-xs text-[#8b737e] mt-1 leading-4">{cfg.description}</p>

              <div className="flex items-center gap-4 mt-4">
                <div className={`${cfg.wide ? "h-24 w-56 rounded-xl" : "h-36 w-36 rounded-full"} shrink-0 overflow-hidden bg-[#f5edf1] border border-white shadow-md grid place-items-center`}>
                  {url ? (
                    cfg.kind === "video" ? (
                      <video src={url} autoPlay loop muted playsInline data-testid={`preview-${cfg.slot}`} className="w-full h-full object-cover" />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt="" data-testid={`preview-${cfg.slot}`} className="w-full h-full object-cover" />
                    )
                  ) : (
                    <span className="text-[11px] text-[#8b737e] text-center px-3 leading-4">Aucun média dédié</span>
                  )}
                </div>
                <div className="min-w-0 text-[11px] text-[#54434c] space-y-1">
                  {row ? (
                    <>
                      <TraceLine label="Ajouté le" at={row.created_at} by={row.created_by_email} />
                      <TraceLine label="Modifié le" at={row.updated_at} by={row.updated_by_email} />
                    </>
                  ) : (
                    <p className="text-[#8b737e] leading-4" data-testid={`fallback-${cfg.slot}`}>{cfg.fallback}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-5">
                <label
                  className={`inline-flex items-center gap-2 rounded-full px-5 h-10 text-sm cursor-pointer ${
                    working ? "bg-[#d9c5cc] text-white cursor-not-allowed" : "bg-[#8f6075] hover:bg-[#71485b] text-white"
                  }`}
                >
                  {cfg.kind === "video" ? <Film size={15} /> : <Upload size={15} />}
                  {working ? "Envoi en cours..." : row ? cfg.replaceLabel : cfg.addLabel}
                  <input
                    type="file"
                    accept={cfg.kind === "video" ? "video/*" : "image/*"}
                    disabled={working || loading || Boolean(loadError)}
                    onChange={onPick(cfg)}
                    data-testid={`file-${cfg.slot}`}
                    className="hidden"
                  />
                </label>
                {row && (
                  <button
                    type="button"
                    onClick={() => remove(cfg)}
                    disabled={working}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-red-600 px-4 h-10 text-sm disabled:opacity-60"
                  >
                    <Trash2 size={14} /> Retirer
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
                {cfg.wide ? "Cadrage large (21:9). Filigrane « © 2026 ZENORIA » centré en bas." : "Cadrage carré, découpé en cercle par le site. Filigrane « © 2026 ZENORIA » au centre, tout en bas du cercle."}
                {cfg.kind === "video" ? " Le traitement se fait dans votre navigateur, en temps réel : restez sur cet onglet." : ""}
              </p>
            </section>
          );
        })}
      </div>

      {/* ANIMATION SAISONNIÈRE DE LA PAGE D'ACCUEIL (automatique, forcée ou désactivée) */}
      <AdminSeasonFx />

      {/* ANIMATION « LE GESTE » : bague, couleur du cœur, vitesse et mode de lecture */}
      <AdminRingAnimation />

      {/* LIVRAISON OFFERTE : montant et interrupteur */}
      <AdminShipping />

      {/* CANAUX DE CONTACT : e-mail, WhatsApp, Signal */}
      <AdminContact />

      {/* AVIS CLIENTES (on/off, avec la charte) ET CONFIDENTIALITÉ (toujours en ligne) */}
      <AdminLegalPages />

      {/* TEXTES DU SITE : Savoir-faire et page d'accueil */}
      <AdminSiteTexts />
      {/* CGV : conditions generales de vente, page publique /cgv */}
      <AdminCgv />

      {/* ZENORIA_ACCOUNT_STEP12_V1 : CADRAGE DU BANDEAU DE L'ESPACE CLIENTE (21:9) */}
      {wideRequest && (
        <PhotoCropper
          file={wideRequest.file}
          onResult={finishWide}
          aspect={ACCOUNT_HERO_ASPECT}
          maxFrameW={640}
          views={ACCOUNT_HERO_VIEWS}
          position="cercle"
          watermarkUrl={WATERMARK_CIRCLE_URL}
          maxSide={ACCOUNT_HERO_MAX_SIDE}
          allowWhole={false}
        />
      )}
      {/* CADRAGE ET TRAITEMENT DE LA VIDÉO D'ACCUEIL */}
      {videoRequest && (
        <VideoCropper
          key={videoRequest.id}
          file={videoRequest.file}
          onResult={finishVideo}
          aspect={CIRCLE_ASPECT}
          maxFrameW={CIRCLE_FRAME_SIZE}
          views={HERO_VIEWS}
          position="cercle"
          watermarkUrl={WATERMARK_CIRCLE_URL}
          maxSeconds={HERO_VIDEO_MAX_SECONDS}
          circleMask
          allowWhole={false}
          title="Cadrer la vidéo de la bannière"
          minSourceWidth={630}
        />
      )}

      {/* CADRAGE DE LA PHOTO DE SAVOIR-FAIRE */}
      {photoRequest && (
        <PhotoCropper
          key={photoRequest.file.name + photoRequest.file.size}
          file={photoRequest.file}
          onResult={finishPhoto}
          aspect={CIRCLE_ASPECT}
          maxFrameW={CIRCLE_FRAME_SIZE}
          views={SAVOIR_VIEWS}
          position="cercle"
          watermarkUrl={WATERMARK_CIRCLE_URL}
          maxSide={CIRCLE_PHOTO_MAX_SIDE}
          circleMask
          allowWhole={false}
          title="Cadrer la photo de Savoir-faire"
          minSourceWidth={570}
        />
      )}
    </>
  );
}
