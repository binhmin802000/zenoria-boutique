import React, { useEffect } from "react";

// ============================================================
// MEDIAGUARD — dissuader le téléchargement des photos et vidéos
//
// À placer UNE fois dans une page publique (voir pages/index.js).
// Il agit sur toutes les photos et vidéos de la page, y compris celles
// qui apparaissent plus tard (fiche produit, panier...).
//
// CE QUE ÇA FAIT
//  - Photos : plus de clic droit « Enregistrer l'image sous... », plus de
//    glisser-déposer vers le bureau, plus d'appui long « Enregistrer »
//    sur téléphone, sélection impossible.
//  - Vidéos : bouton « Télécharger » masqué dans le lecteur (Chrome, Edge),
//    plus de clic droit « Enregistrer la vidéo sous... », plus d'incrustation
//    (image dans l'image) ni de diffusion vers un autre écran.
//  - Le clic droit reste possible partout ailleurs sur le site.
//  - SON COUPÉ : toutes les vidéos restent muettes. Le bouton haut-parleur
//    et le curseur de volume sont masqués, et si une vidéo est rallumée
//    par un autre moyen, le son est recoupé aussitôt.
//    Attention : cela coupe le son dans le lecteur du site, mais la piste
//    audio reste dans le fichier vidéo. Pour la supprimer du fichier lui-même,
//    voir le script retirer_le_son.ps1.
//
// CE QUE ÇA NE FAIT PAS (important)
//  Tout ce qu'un navigateur affiche peut être copié : capture d'écran,
//  outils de développement (F12), onglet « Réseau », extensions. Cette
//  protection arrête les téléchargements simples et occasionnels, pas
//  une personne déterminée. Pour une vraie dissuasion : filigrane, images
//  réduites, mention de droits d'auteur.
// ============================================================

// Règles de style : les images ne reçoivent plus les clics (le clic passe
// à l'élément situé dessous, donc le menu « Enregistrer l'image » n'apparaît pas).
const GUARD_CSS = `
img {
  pointer-events: none;
  -webkit-user-drag: none;
  user-drag: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
video {
  -webkit-touch-callout: none;
}
video::-webkit-media-controls-mute-button,
video::-webkit-media-controls-volume-slider,
video::-webkit-media-controls-volume-slider-container,
video::-webkit-media-controls-volume-control-container {
  display: none !important;
}
`;

// Garde la vidéo muette. Si le son est remis (bouton, raccourci clavier...),
// il est recoupé aussitôt. La condition évite une boucle infinie.
function keepMuted(video) {
  video.defaultMuted = true;
  video.muted = true;
  if (video.__muteHandler) return;
  video.__muteHandler = () => {
    if (!video.muted) video.muted = true;
  };
  video.addEventListener("volumechange", video.__muteHandler);
}

// Retire la surveillance du son (quand le composant disparaît de la page).
function releaseMuted(video) {
  if (!video.__muteHandler) return;
  video.removeEventListener("volumechange", video.__muteHandler);
  delete video.__muteHandler;
}

function hardenVideo(video) {
  keepMuted(video);
  // Chrome et Edge masquent alors le bouton « Télécharger » du lecteur.
  video.setAttribute("controlslist", "nodownload noremoteplayback");
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("disableremoteplayback", "");
}

function hardenTree(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.tagName === "VIDEO") hardenVideo(node);
  if (node.querySelectorAll) node.querySelectorAll("video").forEach(hardenVideo);
}

export default function MediaGuard() {
  useEffect(() => {
    // Bloque le clic droit et le glisser-déposer uniquement sur les médias.
    const blockOnMedia = (event) => {
      const target = event.target;
      if (target && target.closest && target.closest("img, video, picture")) {
        event.preventDefault();
      }
    };
    document.addEventListener("contextmenu", blockOnMedia);
    document.addEventListener("dragstart", blockOnMedia);

    // Applique les réglages aux vidéos déjà présentes, puis à celles ajoutées
    // plus tard (ouverture d'une fiche produit, par exemple).
    hardenTree(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => m.addedNodes.forEach(hardenTree));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("contextmenu", blockOnMedia);
      document.removeEventListener("dragstart", blockOnMedia);
      observer.disconnect();
      document.querySelectorAll("video").forEach(releaseMuted);
    };
  }, []);

  // Les règles de style disparaissent avec le composant : en quittant la page,
  // les autres pages (comme /admin) ne sont pas affectées.
  return <style dangerouslySetInnerHTML={{ __html: GUARD_CSS }} />;
}
