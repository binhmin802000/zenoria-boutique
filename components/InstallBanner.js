// ZENORIA_INSTALL_BANNER_V1
import React from "react";
import { X, Download, Share } from "lucide-react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
// ============================================================
// BANDEAU D'INSTALLATION DE L'APPLICATION — descend du bas de l'écran, une seule fois par
// appareil (mémoire dans le navigateur, jamais par compte : l'installation est liée à l'appareil).
//
//  - Android / Chrome / Edge (ordinateur) : bouton « Installer » qui déclenche directement
//    l'invite native du navigateur (même mécanisme que le bouton du menu, même magasin d'état :
//    lib/useInstallPrompt.js). Disparaît dès l'installation.
//  - iPhone (Safari) : aucun bouton ne peut déclencher l'installation (limite d'Apple) ; le
//    bandeau explique le geste manuel (Partager > Sur l'écran d'accueil).
//  - Partout ailleurs (site déjà installé, aucune invite possible, ou déjà fermé sur cet
//    appareil) : rien ne s'affiche.
//
// À monter UNE SEULE FOIS, dans pages/_app.js, pour qu'il apparaisse sur toutes les pages
// publiques sans dupliquer son montage sur chaque page individuellement.
// ============================================================
export default function InstallBanner() {
  const { showBanner, variant, promptInstall, dismissBanner } = useInstallPrompt();

  if (!showBanner || !variant) return null;

  return (
    <div
      data-testid="install-banner"
      role="region"
      aria-label="Installer l'application Zenoria"
      className="fixed inset-x-0 bottom-0 z-50 animate-[zenoriaInstallBannerUp_0.3s_ease-out]"
    >
      <style>{`@keyframes zenoriaInstallBannerUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div className="mx-auto max-w-2xl m-3 rounded-2xl bg-[#3b2b39] text-white shadow-xl px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 mt-0.5 rounded-xl bg-white/10 p-2">
          <Download size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5">Installez Zenoria pour un accès plus rapide</p>
          {variant === "action" && (
            <p className="text-xs text-white/70 mt-0.5 leading-4">Un raccourci sur votre écran d&apos;accueil, sans passer par le navigateur.</p>
          )}
          {variant === "ios" && (
            <p data-testid="install-banner-ios-instructions" className="text-xs text-white/80 mt-1 leading-5 flex flex-wrap items-center gap-1">
              Appuyez sur <Share size={14} className="inline -mt-0.5" aria-hidden="true" /> <strong className="font-medium">Partager</strong>, puis sur <strong className="font-medium">« Sur l&apos;écran d&apos;accueil »</strong>.
            </p>
          )}
          {variant === "action" && (
            <button
              type="button"
              onClick={promptInstall}
              data-testid="install-banner-button"
              className="mt-2 rounded-full bg-white text-[#3b2b39] text-xs font-medium px-4 h-8"
            >
              Installer
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismissBanner}
          data-testid="install-banner-close"
          aria-label="Fermer"
          className="shrink-0 rounded-full p-1.5 hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
