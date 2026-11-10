import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";

// ============================================================
// BOUTON D'INSTALLATION DE L'APPLICATION (PWA) — ZENORIA_INSTALL_BUTTON_V1
//
// N'apparaît QUE si le navigateur confirme explicitement que l'installation
// est possible (événement "beforeinstallprompt", Chrome/Edge/Android...).
// Reste invisible sur iOS/Safari (pas de bouton inutile : sur iOS,
// l'installation passe par Partager > Sur l'écran d'accueil, geste qui ne
// peut pas être déclenché par un clic de bouton) et sur tout navigateur où
// le site est déjà installé.
//
// Comportement, dans l'ordre :
//   1. Le navigateur envoie "beforeinstallprompt" quand il juge que le site
//      est installable -> on capture cet événement et on affiche le bouton.
//   2. Au clic, on réutilise cet événement capturé pour déclencher la vraie
//      invite native du navigateur (prompt()).
//   3. Une fois l'app installée ("appinstalled"), le bouton disparaît.
// ============================================================
export default function InstallButton({ className = "" }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault(); // empêche la mini-infobar automatique de Chrome : on affiche notre propre bouton à la place
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (!deferredPrompt || installed) return null;

  const handleInstall = async () => {
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice; // résout que la cliente accepte ou refuse : dans les deux cas l'invite est consommée
    } catch (e) {
      // échec silencieux : l'absence d'installation ne doit jamais perturber la navigation
    }
    setDeferredPrompt(null); // un événement "beforeinstallprompt" ne peut être utilisé qu'une seule fois
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      data-testid="install-app-button"
      aria-label="Installer l'application Zenoria"
      className={
        "inline-flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3.5 h-9 text-xs font-medium transition shadow-sm " +
        className
      }
    >
      <Download size={15} />
      <span className="hidden xl:inline">Installer l&apos;app</span> {/* ZENORIA_FIX_HEADER_OVERLAP_V1 : texte masqué entre sm: et xl:, pour laisser de la place au menu */}
    </button>
  );
}
