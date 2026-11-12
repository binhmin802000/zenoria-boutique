import React, { useEffect, useState } from "react";
import { getMediaUrl, getPosterUrl, getThumbUrl } from "@/lib/supabase"; // ZENORIA_HERO_MEDIA_V1
import ThumbImage from "@/components/ThumbImage"; // ZENORIA_HERO_MEDIA_V1
import HeroMedia from "@/components/HeroMedia"; // ZENORIA_HERO_MEDIA_V1
import { formatPrice, getAvailability } from "@/lib/shopUtils";
import { buildMailtoLink, buildWhatsAppLink } from "@/lib/contactSettings"; // ZENORIA_STOCK_UI_V1
import { Pencil } from "lucide-react"; // ZENORIA_2C4_V1

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
    // ZENORIA_HERO_MEDIA_V1 : image fixe + ▶ sur ecran etroit / economie de donnees (voir components/HeroMedia.js)
    return (
      <HeroMedia
        videoSrc={videoSrc}
        posterSrc={getPosterUrl(product.video, product.slug)}
        fallbackSrc={product.photos && product.photos[0] ? getThumbUrl(product.photos[0], product.slug) : null}
        onVideoError={() => setImgError(true)}
      />
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
        {/* ZENORIA_HERO_MEDIA_V1 : miniature dans la grille, photo complete pour les visuels agrandis */}
        {large ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={product.name} onError={() => setImgError(true)} className="w-full h-full object-cover object-center" />
        ) : (
          <ThumbImage path={product.photos[0]} slug={product.slug} alt={product.name} onFail={() => setImgError(true)} className="w-full h-full object-cover object-center" />
        )}
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

// ZENORIA_STOCK_UI_V1 : pastille de disponibilité (plus de fabrication sur commande, aucun chiffre affiché)
export function AvailabilityBadge({ product, qty = 0, showDetail = false }) {
  const a = getAvailability(product, qty);
  const tone =
    a.state === "in-stock"
      ? { color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" }
      : a.state === "out-of-stock" || a.state === "sold"
      ? { color: "bg-[#eeeaec] text-[#6b5f66]", dot: "bg-[#9d9197]" }
      : { color: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${tone.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {a.label}
      {showDetail && a.detail ? ` · ${a.detail}` : ""}
    </span>
  );
}
// Lien « Écrivez-nous » : e-mail en priorité, sinon WhatsApp ; null si aucun canal n'est actif ou si la page n'a pas fourni les réglages
export function contactLink(contactSettings, subject, emailBody, waText) {
  const c = contactSettings || {};
  const email = c.email && c.email.enabled && typeof c.email.value === "string" ? c.email.value.trim() : "";
  const wa = c.whatsapp && c.whatsapp.enabled && typeof c.whatsapp.value === "string" ? c.whatsapp.value.trim() : "";
  if (email) return { href: buildMailtoLink(email, subject, emailBody), external: false };
  if (wa) return { href: buildWhatsAppLink(wa, waText), external: true };
  return null;
}
// Bijou normal épuisé : remplace le bouton « Ajouter au panier » (texte validé)
// ZENORIA_STOCK_UI2_V1 : message sous une ligne du panier qui ne peut pas être commandée telle quelle (textes validés)
export function CartLineNotice({ product, state, contactSettings }) {
  if (!product) return null;
  if (state === "insufficient") {
    const link = contactLink(
      contactSettings,
      `À propos de « ${product.name} »`,
      `Bonjour,\n\nJe souhaiterais davantage d'exemplaires de « ${product.name} ». Est-ce possible ?\n`,
      `Bonjour, je souhaiterais davantage d'exemplaires de « ${product.name} ». Est-ce possible ?`
    );
    return (
      <div data-testid="cart-line-insufficient" className="text-[11px] leading-4 text-amber-800 mt-1">
        {`Il ne reste pas assez d'exemplaires de « ${product.name} » : réduisez la quantité pour continuer. Si vous en souhaitez davantage, `}
        {link ? (
          <a href={link.href} target={link.external ? "_blank" : undefined} rel="noopener noreferrer" className="underline">écrivez-nous</a>
        ) : (
          "écrivez-nous"
        )}
        .
      </div>
    );
  }
  return (
    <div data-testid="cart-line-unavailable" className="text-[11px] leading-4 text-red-700 mt-1">
      {`« ${product.name} » n'est plus disponible. Retirez cet article de votre panier pour continuer.`}
    </div>
  );
}
// Carte du catalogue d'un bijou normal épuisé : « Écrivez-nous » à la place du bouton « Ajouter au panier »
// ZENORIA_2C4_V1 : « Écrivez-nous » (icône stylo) pour TOUTE bague non commandable : bijou épuisé, pièce unique réservée ou vendue.
// Le message prérempli dépend de l'état (textes validés). compact : version réduite (panneau « Mes favoris »).
export function CatalogWriteUs({ product, contactSettings, compact = false }) {
  if (!product) return null;
  const a = getAvailability(product);
  const [emailBody, waText] =
    a.state === "sold"
      ? [
          `Bonjour,\n\nLe modèle « ${product.name} » m'a touchée, et j'aimerais en savoir plus sur une création qui s'en inspire.\n`,
          `Bonjour, le modèle « ${product.name} » m'a touchée, j'aimerais en savoir plus sur une création qui s'en inspire.`,
        ]
            : a.state === "reserved"
      ? [
          `Bonjour,\n\n« ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?\n`,
          `Bonjour, « ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?`,
        ]
      : [
          `Bonjour,\n\nJe souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?\n`,
          `Bonjour, je souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?`,
        ];
  const link = contactLink(contactSettings, `À propos de « ${product.name} »`, emailBody, waText);
  const cls = compact
    ? "inline-flex items-center gap-1.5 rounded-full border border-[#d9c5cc] px-3 py-1 text-xs text-[#8f6075] hover:bg-[#f5edf1] transition"
    : "flex w-full mt-5 h-10 items-center justify-center gap-2 rounded-full border border-[#d9c5cc] text-sm text-[#8f6075] hover:bg-[#f5edf1] transition";
  return link ? (
    <a href={link.href} target={link.external ? "_blank" : undefined} rel="noopener noreferrer" data-testid="catalog-write-us" data-state={a.state} className={cls}>
      <Pencil size={compact ? 12 : 15} aria-hidden="true" />
      Écrivez-nous
    </a>
  ) : (
    <span data-testid="catalog-write-us" data-state={a.state} className={cls}>{a.label}</span>
  );
}
// Bijou normal épuisé : remplace le bouton « Ajouter au panier » (texte validé)
// ZENORIA_STOCK_UI3_V1 : bague en cours de commande par une autre cliente (bijou normal tout réservé, ou pièce unique réservée).
// Texte validé, sans durée : il vaut pour un paiement par carte (31 min) comme par virement (jusqu'à l'échéance).
export function ReservedNotice({ product, contactSettings, unique = false }) {
  if (!product) return null;
  const link = contactLink(
    contactSettings,
    `À propos de « ${product.name} »`,
    `Bonjour,\n\n« ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?\n`,
    `Bonjour, « ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?`
  );
  const cls = unique
    ? "text-sm leading-6 text-[#54434c] mt-4 rounded-xl bg-[#f5edf1] px-4 py-3"
    : "mt-7 text-sm leading-6 text-[#54434c] rounded-xl bg-[#f5edf1] px-4 py-3";
  return (
    <p data-testid="reserved-notice" data-state="reserved" className={cls}>
      {unique && <span className="font-medium">✦ Pièce unique — </span>}
      {`« ${product.name} » fait déjà battre un autre cœur : une cliente est en train de finaliser sa commande. Si elle ne l'emporte pas, la bague sera de nouveau à vous. `}
      {link ? (
        <>
          <a href={link.href} target={link.external ? "_blank" : undefined} rel="noopener noreferrer" className="underline text-[#8f6075]">Écrivez-nous</a>
          {" pour être prévenue."}
        </>
      ) : (
        "Écrivez-nous pour être prévenue."
      )}
    </p>
  );
}
export function UnavailableNotice({ product, contactSettings }) {
  if (!product) return null;
  if (getAvailability(product).state === "reserved") return <ReservedNotice product={product} contactSettings={contactSettings} />;
  const link = contactLink(
    contactSettings,
    `À propos de « ${product.name} »`,
    `Bonjour,\n\nJe souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?\n`,
    `Bonjour, je souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?`
  );
  return (
    <p data-testid="product-unavailable" className="mt-7 text-sm leading-6 text-[#54434c] rounded-xl bg-[#f5edf1] px-4 py-3">
      Cette création est actuellement épuisée.{" "}
      {link ? (
        <>
          <a href={link.href} target={link.external ? "_blank" : undefined} rel="noopener noreferrer" className="underline text-[#8f6075]">Écrivez-nous</a>{" "}
          pour savoir si elle sera de nouveau disponible.
        </>
      ) : (
        "Écrivez-nous pour savoir si elle sera de nouveau disponible."
      )}
    </p>
  );
}
// Encart « pièce unique » à trois états (validé) : disponible, réservée, vendue
export function PieceUniqueNotice({ product, contactSettings }) {
  if (!product || product.isUnique !== true) return null;
  const state = product.pieceState === "sold" ? "sold" : product.pieceState === "reserved" ? "reserved" : "available";
  const base = "text-sm leading-6 text-[#54434c] mt-4 rounded-xl bg-[#f5edf1] px-4 py-3";
  if (state === "available") {
    return (
      <p data-testid="unique-notice" data-state="available" className={base}>
        <span className="font-medium">✦ Pièce unique</span> — Façonnée une seule fois, elle ne sera jamais reproduite à l&apos;identique.
      </p>
    );
  }
    if (state === "reserved") {
    return <ReservedNotice product={product} contactSettings={contactSettings} unique />; // ZENORIA_STOCK_UI3_V1
  }
  const link = contactLink(
    contactSettings,
    `À propos de « ${product.name} »`,
    `Bonjour,\n\nLe modèle « ${product.name} » m'a touchée, et j'aimerais en savoir plus sur une création qui s'en inspire.\n`,
    `Bonjour, le modèle « ${product.name} » m'a touchée, j'aimerais en savoir plus sur une création qui s'en inspire.`
  );
  return (
    <p data-testid="unique-notice" data-state="sold" className={base}>
      <span className="font-medium">✦ Pièce unique</span> — Façonnée une seule fois, elle ne sera jamais reproduite à l&apos;identique.{" "}
      {link ? (
        <>
          Elle vous touche ?{" "}
          <a href={link.href} target={link.external ? "_blank" : undefined} rel="noopener noreferrer" className="underline text-[#8f6075]">Écrivez-nous</a>
          {" "}: nous pouvons imaginer une création qui s&apos;en inspire.
        </>
      ) : (
        "Contactez-nous pour en savoir plus sur une création qui s'en inspire."
      )}
    </p>
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
          // ZENORIA_PRELOAD_VIDEOS_V1 : preload metadata, chargee seulement a l'ouverture de la fiche produit
          <video
            key={videoSrc}
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            controls
            preload="metadata"
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
