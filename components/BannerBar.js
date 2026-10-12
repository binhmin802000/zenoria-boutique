import React, { useEffect, useRef, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { bannerRange, countdownText, splitMessage } from "@/lib/banners";

// ============================================================
// BANDEAU — la barre fine affichée tout en haut du site pour une occasion (fête des mères, Noël, nouveautés...)
//
// Composant d'AFFICHAGE : il ne décide ni quand ni si un bandeau s'affiche (voir lib/banners.js, pickCurrentBanner).
//  - dans l'administration (aperçu), il est « inerte » : aucun bouton n'est actif ;
//  - sur le site, il reçoit onClose (croix) et onButton (destination du bouton).
//
// Le message est affiché comme du TEXTE : aucun HTML saisi n'est interprété. {code} devient le code promo (avec un
// bouton « Copier ») et {fin} la date de fin. Le compte à rebours (si activé) est en jours et heures, sans secondes.
// ============================================================

export default function BannerBar({ banner, nowMs, inert = false, onClose, onButton }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  if (!banner) return null;

  const [, end] = bannerRange(banner);
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const segments = splitMessage(banner.message, { code: banner.code, endIso: banner.ends_at });
  const countdown = banner.countdown ? countdownText(end, now) : "";
  const hasButton = Boolean(banner.button_label && String(banner.button_label).trim());

  const copy = () => {
    try {
      const pr = navigator.clipboard.writeText(banner.code);
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) {
      // presse-papiers indisponible (connexion non sécurisée) : on affiche quand même la confirmation
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div role="region" aria-label="Annonce de la boutique" data-testid="banner-bar" className="bg-[#46293a] text-white/90 text-[12.5px] border-b border-[#d8b36d]/40">
      <div className={`max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 relative ${inert || !onClose ? "" : "pr-10"}`}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#d8b36d] shrink-0" aria-hidden="true" />
        <span className="leading-6 text-center" data-testid="banner-message">
          {segments.map((s, i) => {
            if (s.type === "code") {
              return (
                <span key={i} className="inline-flex items-center gap-1.5 align-middle mx-0.5">
                  <span data-testid="banner-code" className="rounded-full border border-[#d8b36d]/70 px-2.5 py-0.5 font-medium tracking-wider text-[#f0d79a]">
                    {s.value}
                  </span>
                  {inert ? (
                    <span className="text-[11px] underline underline-offset-2 text-white/80">Copier</span>
                  ) : (
                    <button type="button" onClick={copy} data-testid="banner-copy" className="text-[11px] underline underline-offset-2 text-white/80 hover:text-white">
                      {copied ? "Copié ✓" : "Copier"}
                    </button>
                  )}
                </span>
              );
            }
            return <React.Fragment key={i}>{s.value}</React.Fragment>;
          })}
        </span>
        {countdown && (
          <span data-testid="banner-countdown" className="rounded-full bg-white/10 px-3 py-0.5 text-[11.5px] text-[#f0d79a]">
            {countdown}
          </span>
        )}
        {hasButton &&
          (inert ? (
            <span className="inline-flex items-center gap-1.5 text-[#f0d79a] underline underline-offset-4 decoration-[#d8b36d]/60">
              {banner.button_label}
              <ArrowRight size={14} />
            </span>
          ) : (
            <button
              type="button"
              data-testid="banner-button"
              onClick={() => onButton && onButton(banner.button_target, banner.button_url)}
              className="inline-flex items-center gap-1.5 text-[#f0d79a] hover:text-white underline underline-offset-4 decoration-[#d8b36d]/60"
            >
              {banner.button_label}
              <ArrowRight size={14} />
            </button>
          ))}
        {!inert && onClose && (
          <button
            type="button"
            data-testid="banner-close"
            onClick={onClose}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Fermer l'annonce"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
