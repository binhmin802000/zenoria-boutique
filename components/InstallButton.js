import React from "react"; // ZENORIA_INSTALL_BANNER_V1
import { Download } from "lucide-react";
import { useInstallPrompt } from "@/lib/useInstallPrompt"; // ZENORIA_INSTALL_BANNER_V1
// ============================================================
// BOUTON D'INSTALLATION DE L'APPLICATION (PWA) — ZENORIA_INSTALL_BUTTON_V1 / ZENORIA_INSTALL_BANNER_V1
//
// N'apparaît QUE si le navigateur confirme explicitement que l'installation
// est possible (événement "beforeinstallprompt", Chrome/Edge/Android...).
// Reste invisible sur iOS/Safari (pas de bouton inutile : sur iOS,
// l'installation passe par Partager > Sur l'écran d'accueil, geste qui ne
// peut pas être déclenché par un clic de bouton) et sur tout navigateur où
// le site est déjà installé.
//
// Logique partagée avec le bandeau (components/InstallBanner.js) via lib/useInstallPrompt.js :
// installer ou fermer depuis l'un des deux met immédiatement à jour l'autre.
// ============================================================
export default function InstallButton({ className = "" }) {
  const { showButton, promptInstall } = useInstallPrompt();

  if (!showButton) return null;

  return (
    <button
      type="button"
      onClick={promptInstall}
      data-testid="install-app-button"
      aria-label="Installer l'application Zenoria"
      className={
        "flex flex-col items-center justify-center gap-0.5 rounded-xl bg-[#8f6075] hover:bg-[#71485b] text-white w-12 h-12 text-[9px] leading-none font-medium transition shadow-sm " + // ZENORIA_INSTALL_BUTTON_VERTICAL_V1
        className
      }
    >
      <Download size={15} />
      <span>Installer</span> {/* ZENORIA_INSTALL_BUTTON_VERTICAL_V1 : disposition verticale, toujours visible, sans elargir la largeur */}
    </button>
  );
}
