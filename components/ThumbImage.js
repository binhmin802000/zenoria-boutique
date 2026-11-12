// ZENORIA_MEDIA_VARIANTS_V1
import React, { useEffect, useState } from "react";
import { getMediaUrl, getThumbUrl } from "@/lib/supabase";
// ============================================================
// Vignette d'une photo de bijou : affiche la MINIATURE (legere) et retombe sur la photo d'origine si elle n'existe pas
// encore (photo envoyee avant la mise en place des miniatures, ancien format). Ce n'est que si l'original lui-meme ne se
// charge pas qu'on appelle onFail (la page affiche alors son visuel de remplacement, comme avant).
//
//  path    : chemin de la photo tel qu'enregistre en base (products.photos[n])
//  slug    : slug du bijou (necessaire pour les anciens formats)
//  onFail  : appelee quand ni la miniature ni l'original ne se chargent
// ============================================================
export default function ThumbImage({ path, slug, alt = "", className = "", onFail }) {
  const thumb = getThumbUrl(path, slug);
  const full = getMediaUrl(path, slug);
  const hasThumb = Boolean(thumb && full && thumb !== full);
  const [stage, setStage] = useState(hasThumb ? "thumb" : "full");
  useEffect(() => {
    setStage(hasThumb ? "thumb" : "full");
  }, [path, slug, hasThumb]);
  const src = stage === "thumb" ? thumb : full;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      data-stage={stage}
      onError={() => {
        if (stage === "thumb") setStage("full");
        else if (onFail) onFail();
      }}
    />
  );
}
