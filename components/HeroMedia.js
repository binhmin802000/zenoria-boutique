// ZENORIA_HERO_MEDIA_V1
import React, { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { shouldAutoplayHero } from "@/lib/mediaVariants";
// ============================================================
// VIDEO D'ACCUEIL (cercle de la banniere) : lecture automatique OU image fixe avec un bouton ▶.
//
// La decision se prend dans le NAVIGATEUR, une seule fois, apres l'affichage (jamais sur le serveur : il ne connait ni la taille
// de l'ecran ni les reglages de la visiteuse). Avant la decision, un simple cercle noir : aucun media n'est demande, donc aucun
// octet de video n'est telecharge pour une visiteuse qui n'en veut pas.
//   - ordinateur normal : la video demarre, comme avant ;
//   - ecran etroit (< 768 px), « economie de donnees », connexion 2G ou « reduire les animations » : image fixe + bouton ▶ ;
//     la video n'est telechargee que si la visiteuse appuie sur ▶.
//
//  videoSrc    : adresse de la video
//  posterSrc   : image fixe de la video (poster_...), ou null (video envoyee avant les images fixes)
//  fallbackSrc : image de remplacement si l'image fixe n'existe pas (par ex. miniature de la 1re bague), ou null
//  mobileAutoplay : (reserve a un reglage d'administration futur) true = lecture automatique aussi sur ecran etroit
//  onVideoError   : appelee si la video ne se charge pas (la page revient a son visuel de secours)
// ============================================================
function readEnvironment() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  let reducedMotion = false;
  try {
    reducedMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    reducedMotion = false;
  }
  return {
    width: window.innerWidth,
    saveData: Boolean(conn && conn.saveData === true),
    effectiveType: conn && conn.effectiveType ? conn.effectiveType : undefined,
    reducedMotion,
  };
}

export default function HeroMedia({ videoSrc, posterSrc = null, fallbackSrc = null, mobileAutoplay = false, onVideoError }) {
  const [decision, setDecision] = useState("pending"); // pending | play | still
  const [started, setStarted] = useState(false); // la visiteuse a appuye sur ▶
  const initialStage = posterSrc ? "poster" : fallbackSrc ? "fallback" : "none";
  const [stage, setStage] = useState(initialStage);

  useEffect(() => {
    setDecision(shouldAutoplayHero({ ...readEnvironment(), mobileAutoplay }) ? "play" : "still");
  }, [mobileAutoplay]);
  useEffect(() => {
    setStage(initialStage);
    setStarted(false);
  }, [videoSrc, posterSrc, fallbackSrc, initialStage]);

  let content = null;
  if (decision === "play" || started) {
    content = (
      <video
        key={videoSrc}
        src={videoSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        onError={onVideoError}
        data-testid="hero-video"
        className="w-full h-full object-cover object-center"
      />
    );
  } else if (decision === "still") {
    const imgSrc = stage === "poster" ? posterSrc : stage === "fallback" ? fallbackSrc : null;
    content = (
      <>
        {imgSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt=""
            aria-hidden="true"
            data-testid="hero-still"
            data-stage={stage}
            className="absolute inset-0 w-full h-full object-cover object-center"
            onError={() => setStage((s) => (s === "poster" && fallbackSrc ? "fallback" : "none"))}
          />
        )}
        <button
          type="button"
          onClick={() => setStarted(true)}
          aria-label="Lancer la vidéo"
          data-testid="hero-play"
          className="absolute inset-0 grid place-items-center"
        >
          <span className="h-14 w-14 rounded-full bg-white/85 shadow-lg grid place-items-center">
            <Play size={22} className="text-[#6f4a5c] ml-0.5" aria-hidden="true" />
          </span>
        </button>
      </>
    );
  }
  return (
    <div data-testid="hero-media" data-decision={started ? "play" : decision} className="relative w-full h-full rounded-full overflow-hidden bg-black">
      {content}
    </div>
  );
}
