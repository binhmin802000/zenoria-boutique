import React, { useEffect, useState } from "react";
import { getMediaUrl } from "@/lib/supabase";
import { formatPrice, getAvailability } from "@/lib/shopUtils";

// ============================================================================
// ÉLÉMENTS DE FICHE BAGUE partagés entre l'accueil et la page du quiz :
// visuel (photo, vidéo ou visuel de remplacement), pastille de disponibilité, prix, galerie de la fiche.
// Ces blocs viennent de pages/index.js, déplacés tels quels : leur comportement n'a pas changé.
// ============================================================================

// Visuel produit : utilise la vraie photo (ou la vidéo pour le Hero) si présente,
// qu'elle vienne de Supabase Storage (upload via /admin) ou de /public/images
// (anciennes collections), sinon affiche un visuel graphique de remplacement.
export function RingVisual({ product, large = false, circle = false, video = false }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = product.photos && product.photos[0] ? getMediaUrl(product.photos[0], product.slug) : null;
  const videoSrc = product.video ? getMediaUrl(product.video, product.slug) : null;

  if (circle && video && videoSrc && !imgError) {
    return (
      <div className="relative w-full h-full rounded-full overflow-hidden bg-black">
        <video
          key={videoSrc}
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center"
        />
      </div>
    );
  }

  if (imgSrc && !imgError) {
    if (circle) {
      return (
        <div className="relative w-full h-full rounded-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center"
          />
        </div>
      );
    }
    return (
      <div className={`relative overflow-hidden ${large ? "h-[360px]" : "h-56"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={product.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center"
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${product.color} ${large ? "h-[360px]" : "h-56"} flex items-center justify-center`}>
      <div className={`${large ? "h-44 w-44" : "h-28 w-28"} rounded-full border-[10px] border-[#d2a66d] shadow-[inset_0_0_18px_rgba(89,53,31,.28),0_20px_35px_rgba(78,45,67,.18)] relative`}>
        <div className={`absolute left-1/2 -translate-x-1/2 -top-10 ${large ? "h-24 w-24 text-5xl" : "h-16 w-16 text-3xl"} rotate-45 rounded-2xl bg-white/75 backdrop-blur border border-white shadow-xl flex items-center justify-center`}>
          <span className="-rotate-45">{product.stone}</span>
        </div>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,.9),transparent_18%),radial-gradient(circle_at_72%_18%,rgba(255,255,255,.75),transparent_10%)]" />
    </div>
  );
}

// Pastille de disponibilité
export function AvailabilityBadge({ product, qty = 0, showDetail = false }) {
  const a = getAvailability(product, qty);
  const color = a.state === "in-stock" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
  const dot = a.state === "in-stock" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {a.label}
      {showDetail && a.detail ? ` · ${a.detail}` : ""}
    </span>
  );
}

// Affiche un prix, avec le prix barré si une promotion est active
export function PriceTag({ product, className = "" }) {
  const hasPromo = product.promoPrice != null && product.promoPrice < product.price;
  if (!hasPromo) {
    return <span className={className}>{formatPrice(product.price)}</span>;
  }
  return (
    <span className={className}>
      <span className="line-through text-[#b0a3a9] mr-1.5 font-normal">{formatPrice(product.price)}</span>
      <span className="text-[#b2544a]">{formatPrice(product.promoPrice)}</span>
    </span>
  );
}

// Visuel affiché dans la fiche produit (modal).
export function ProductMedia({ product, initialMode = "video" }) {
  const [videoError, setVideoError] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [photoIndex, setPhotoIndex] = useState(0);
  const videoSrc = product.video ? getMediaUrl(product.video, product.slug) : null;
  const photos = product.photos || [];

  useEffect(() => {
    setMode(initialMode);
    setPhotoIndex(0);
    setVideoError(false);
  }, [product.slug, initialMode]);

  const hasVideo = Boolean(videoSrc) && !videoError;
  const hasPhotos = photos.length > 0;

  const goPrevPhoto = () => setPhotoIndex((i) => (i === 0 ? photos.length - 1 : i - 1));
  const goNextPhoto = () => setPhotoIndex((i) => (i === photos.length - 1 ? 0 : i + 1));

  return (
    <div>
      <div className="relative overflow-hidden h-[360px] bg-black">
        {mode === "video" && hasVideo ? (
          <video
            key={videoSrc}
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            controls
            onError={() => setVideoError(true)}
            className="w-full h-full object-cover object-center"
          />
        ) : hasPhotos ? (
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={photos[photoIndex]}
              src={getMediaUrl(photos[photoIndex], product.slug)}
              alt={`${product.name} - photo ${photoIndex + 1}`}
              className="w-full h-full object-cover object-center"
            />
            {photos.length > 1 && (
              <>
                <button
                  onClick={goPrevPhoto}
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 hover:bg-white grid place-items-center"
                  aria-label="Photo précédente"
                >
                  ‹
                </button>
                <button
                  onClick={goNextPhoto}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 hover:bg-white grid place-items-center"
                  aria-label="Photo suivante"
                >
                  ›
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {photos.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${i === photoIndex ? "bg-white" : "bg-white/50"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <RingVisual product={product} large />
        )}
      </div>
      <div className="flex gap-2 px-8 pt-4">
        {hasVideo && (
          <button
            onClick={() => setMode("video")}
            className={`rounded-full px-3 py-1 text-xs ${mode === "video" ? "bg-[#8f6075] text-white" : "bg-[#f5edf1] text-[#826d77]"}`}
          >
            Vidéo
          </button>
        )}
        {hasPhotos && (
          <button
            onClick={() => setMode("photo")}
            className={`rounded-full px-3 py-1 text-xs ${mode === "photo" ? "bg-[#8f6075] text-white" : "bg-[#f5edf1] text-[#826d77]"}`}
          >
            {photos.length} photo{photos.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
}
