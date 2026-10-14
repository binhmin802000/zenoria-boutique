import React, { useEffect, useState } from "react";
import { supabase, getMediaUrl, SITE_MEDIA_TABLE } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  RING_SETTING_KEY,
  RING_SLOT,
  DEFAULT_RING_PHOTO,
  DEFAULT_RING_SETTING,
  parseRingSetting,
  speedValue,
  ringColorFromPath,
  resolveHeartColor,
} from "@/lib/ringSettings";
import RingHandsVideo from "@/components/RingHandsVideo";

// ============================================================
// ANIMATION « LE GESTE » SOUS LA SECTION SAVOIR-FAIRE
//
// Lit les réglages enregistrés depuis l'onglet « Contenu du site » de /admin :
//  - « site_settings », clé « ring_animation » : vitesse, mode de lecture, couleur du cœur
//  - « site_media », emplacement « ring_animation_photo » : la photo détourée de la bague
//
// Si la lecture échoue (script SQL pas encore exécuté, connexion coupée), l'animation s'affiche quand même, avec
// la bague par défaut et les réglages recommandés : la page n'est jamais cassée par ces réglages.
//
// Mode « disparaît après la lecture » : la zone se replie en douceur (marge comprise), puis le bloc est retiré,
// pour ne laisser aucun vide dans la page.
//
// accent : couleur d'accent de la saison active (utilisée si le cœur doit prendre la couleur de la saison)
// ============================================================

const MARGIN_TOP = "5rem";

// Lit les réglages et la bague. Ne lève jamais d'erreur : en cas de problème (script SQL pas encore exécuté,
// connexion coupée, valeur abîmée), on renvoie la bague par défaut et les réglages recommandés.
export async function fetchRingConfig(client) {
  let setting = DEFAULT_RING_SETTING;
  let photoPath = null;
  try {
    const [setRes, mediaRes] = await Promise.all([
      client.from(SITE_SETTINGS_TABLE).select("value").eq("key", RING_SETTING_KEY).maybeSingle(),
      client.from(SITE_MEDIA_TABLE).select("path").eq("slot", RING_SLOT).maybeSingle(),
    ]);
    if (!setRes.error && setRes.data) setting = parseRingSetting(setRes.data.value);
    if (!mediaRes.error && mediaRes.data && typeof mediaRes.data.path === "string" && mediaRes.data.path) photoPath = mediaRes.data.path;
  } catch (e) {
    // réglages illisibles : valeurs par défaut
  }
  return { setting, photoPath };
}

export default function RingAnimationSection({ accent }) {
  const [state, setState] = useState({ ready: false, setting: DEFAULT_RING_SETTING, photoPath: null });
  const [collapsing, setCollapsing] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchRingConfig(supabase).then((cfg) => {
      if (alive) setState({ ready: true, setting: cfg.setting, photoPath: cfg.photoPath });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (gone) return null;

  const wrapStyle = { marginTop: collapsing ? 0 : MARGIN_TOP, transition: "margin-top .8s ease" };

  if (!state.ready) {
    // place réservée pendant la lecture des réglages : pas de saut de mise en page
    return (
      <div className="max-w-4xl mx-auto px-6" style={wrapStyle}>
        <div style={{ width: "100%", aspectRatio: "1280 / 704" }} />
      </div>
    );
  }

  const ringSrc = state.photoPath ? getMediaUrl(state.photoPath, "site") : DEFAULT_RING_PHOTO;
  const crystalColor = resolveHeartColor(state.setting, ringColorFromPath(state.photoPath), accent);

  return (
    <div className="max-w-4xl mx-auto px-6" style={wrapStyle}>
      <RingHandsVideo
        crystalColor={crystalColor}
        ringSrc={ringSrc}
        speed={speedValue(state.setting.speed)}
        mode={state.setting.mode}
        onVanishStart={() => setCollapsing(true)}
        onVanished={() => setGone(true)}
      />
    </div>
  );
}
