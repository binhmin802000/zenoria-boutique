// ============================================================
// PATCH — BANDEAU D'INSTALLATION DE L'APPLICATION — ZENORIA_INSTALL_BANNER_V1
//
// Modifie : components/InstallButton.js (remplace sa logique interne par le hook partage,
//           rendu visuel strictement inchange)
// Ajoute   : lib/installPrompt.js, lib/installPromptStore.js, lib/useInstallPrompt.js,
//            components/InstallBanner.js (a copier AVANT, ce script ne les cree pas)
//
// Le bouton et le bandeau partagent desormais UN SEUL magasin d'etat (installPromptStore.js) :
// installer ou fermer depuis l'un met a jour l'autre immediatement, sans configuration
// supplementaire. Reste a monter <InstallBanner /> UNE SEULE FOIS dans pages/_app.js pour qu'il
// apparaisse sur toutes les pages (etape separee, documentee a la livraison).
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sinon rien n'est ecrit.
// Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-install-banner.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-install-banner]";
const FILE = "components/InstallButton.js";
const MARKER = "ZENORIA_INSTALL_BANNER_V1";
const REQUIRED_NEW_FILES = ["lib/installPrompt.js", "lib/installPromptStore.js", "lib/useInstallPrompt.js", "components/InstallBanner.js"];

// Remplace l'intégralité du corps du composant (logique interne) par un appel au hook partagé.
// Les deux ancres (import, et le début/fin du composant) garantissent qu'on ne touche qu'à la
// logique, jamais aux classes CSS ni au contenu visuel du bouton.
const NEW_BODY = `import React from "react"; // ${MARKER}
import { Download } from "lucide-react";
import { useInstallPrompt } from "@/lib/useInstallPrompt"; // ${MARKER}
// ============================================================
// BOUTON D'INSTALLATION DE L'APPLICATION (PWA) — ZENORIA_INSTALL_BUTTON_V1 / ${MARKER}
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
`;

const problems = [];
for (const rel of REQUIRED_NEW_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) problems.push(rel + " : fichier a copier avant de lancer ce script");
}

const full = path.join(ROOT, FILE);
let out = null;
let crlf = false;
if (!fs.existsSync(full)) {
  problems.push(FILE + " : fichier introuvable (lancer le script depuis le dossier du projet)");
} else {
  const raw = fs.readFileSync(full, "utf8");
  crlf = raw.includes("\r\n");
  const text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(FILE + " : deja patche (" + MARKER + " present), rien a faire");
  } else if (!text.includes('data-testid="install-app-button"') || !text.includes("beforeinstallprompt")) {
    problems.push(FILE + " : le fichier ne ressemble pas a la version attendue (reperes de base absents), rien n'est ecrit par securite");
  } else {
    out = crlf ? NEW_BODY.replace(/\n/g, "\r\n") : NEW_BODY;
  }
}

if (problems.length > 0 || out === null) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

fs.writeFileSync(full, out, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
