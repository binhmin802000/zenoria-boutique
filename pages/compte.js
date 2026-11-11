// ZENORIA_ACCOUNT_STEP11_V1 · ZENORIA_ACCOUNT_STEP12_V1 · ZENORIA_ACCOUNT_HERO_B_V1 · ZENORIA_ACCOUNT_STEP13_V1 · ZENORIA_ACCOUNT_STEP14_V1
import React, { useCallback, useEffect, useState } from "react";
import AccountDataSection from "@/components/AccountDataSection";
import TransferInstructions from "@/components/TransferInstructions"; // ZENORIA_STEP3C2_V1
import { CatalogWriteUs } from "@/components/ProductParts"; // ZENORIA_FAV_STOCK_V1
import { getAvailability, pieceStateMap, stockStateMap } from "@/lib/shopUtils";
import { autoCancelAt, isAutoCancelAlert, formatAutoCancel, DEFAULT_BANK_TRANSFER } from "@/lib/paymentSettings"; // ZENORIA_AUTO_CANCEL_UI_V1
import AccountProfileSection from "@/components/AccountProfileSection";
import Head from "next/head";
import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H4
import SeasonFx from "@/components/SeasonFx"; // ZENORIA_COMPTE_SEASON_FX_V1
import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut, Truck, Hand as HandIcon, ChevronLeft, FileDown, AlertTriangle } from "lucide-react"; // ZENORIA_INVOICE_STEP3_V1
import { supabase as supabaseForInvoice } from "@/lib/supabase"; // ZENORIA_INVOICE_STEP3_V1
import { supabase, getMediaUrl, SITE_MEDIA_TABLE, SITE_SLOT_ACCOUNT_HERO } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE, SEASON_FX_KEY, parseSeasonFxSetting, pickFxSeason } from "@/lib/siteSettings"; // ZENORIA_COMPTE_SEASON_FX_V1
import { fetchReviewsSetting, DEFAULT_REVIEWS, REVIEWS_RULES, REFUSAL_REASONS, reviewErrorMessage } from "@/lib/reviewsSettings";
import { CONTACT_KEY, DEFAULT_CONTACT, parseContactSetting, buildMailtoLink, buildWhatsAppLink, buildSignalLink } from "@/lib/contactSettings";
import { CUSTOMER_VISIBLE_STATUSES, TRACKING_STEPS, orderStatusInfo, formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay";
import { resolveFxSeason } from "@/lib/seasons"; // ZENORIA_COMPTE_SEASON_FX_V1
import { useAccountNews } from "@/lib/useAccountNews"; // ZENORIA_ACCOUNT_NEWS_V1

// ============================================================
// PAGE « MON COMPTE » — /compte (espace cliente)
//
// Page affichée côté navigateur (la session Supabase vit dans le navigateur), non indexée.
// Non connectée ou session expirée : retour à l'accueil avec la fenêtre de connexion ouverte
// (/?connexion=compte), puis retour automatique ici après la connexion (pages/index.js).
// Rubriques accessibles par adresse directe : /compte#accueil, #commandes, #avis, #favoris, #profil, #donnees.
// « Mes avis » : visible si l'interrupteur des avis est sur ON, ou pour l'administration.
// Bandeau : rendu validé « Ivoire champagne » (étape 1.2), modifiable dans Admin › Contenu du site.
//
// Étape 1.3 — Accueil et Mes commandes (voir le détail dans le code ci-dessous).
//
// Étape 1.4 — Mes avis et Mes favoris :
//  - Mes avis : reprend la logique de l'ancien panneau « Mes commandes & avis » (components/MyReviewsPanel.js,
//    désormais retiré de pages/index.js), présentée en section de page plutôt qu'en panneau latéral.
//    Fonctions SQL : list_reviewable_items, submit_review, withdraw_review (tous les contrôles côté base).
//  - Mes favoris : reprend la logique du panneau « Mes favoris » de pages/index.js (addFavorite,
//    removeFavorite, lib/favorites). Simplification validée : pas de « Voir la fiche » (la fenêtre du
//    bijou n'existe que sur l'accueil) ; un lien « Voir toutes les créations » renvoie à l'accueil.
//    « Ajouter au panier » suit un principe similaire d'ajout au panier existant (puis
//    retour à l'accueil avec ?panier=compte qui l'ouvre automatiquement, voir pages/index.js).
//  - Le cœur de l'en-tête (pages/index.js) garde son propre panneau rapide « Mes favoris », inchangé.
//  - CART_STORAGE_KEY reste dupliqué depuis pages/index.js (voir étape 1.3) ; plus de plafond fixe de quantité (lot 2c, stock) ;
//    effectivePrice (prix promo) est également dupliqué ici à l'identique de pages/index.js : à garder
//    synchronisé si cette règle change un jour (vigilance listes dupliquées, état des lieux).
// ============================================================

const SECTIONS = [
  { id: "accueil", label: "Accueil", icon: Home, step: "1.3" },
  { id: "commandes", label: "Mes commandes", icon: Package, step: "1.3" },
  { id: "avis", label: "Mes avis", icon: Star, step: "1.4", reviews: true },
  { id: "favoris", label: "Mes favoris", icon: Heart, step: "1.4" },
  { id: "profil", label: "Profil & sécurité", icon: UserCog, step: "1.6" },
  { id: "donnees", label: "Mes données", icon: ShieldCheck, step: "1.6" },
];
const RETURN_KEY = "zenoria_return_to";
const DEFAULT_HERO = "/images/compte-fondu-lumineux.jpg";
const CART_STORAGE_KEY = "zenoria_cart_v2"; // doit rester identique à pages/index.js
// ZENORIA_STOCK_UI2_V1 : plus de plafond fixe ; la quantité est contrôlée par le stock à l'ouverture du panier (pages/index.js)
const TIME_ZONE = "Europe/Paris";
const REVIEW_LABELS = ["", "Décevante", "Moyenne", "Bien", "Très bien", "Coup de cœur"];
const REVIEW_STATUS = {
  pending: { label: "En attente de relecture", cls: "bg-amber-50 text-amber-800" },
  published: { label: "Publié", cls: "bg-emerald-50 text-emerald-700" },
  refused: { label: "Non publié", cls: "bg-red-50 text-red-700" },
  withdrawn: { label: "Retiré", cls: "bg-[#f3f1f5] text-[#8b737e]" },
};

function readHash() {
  if (typeof window === "undefined") return "accueil";
  const h = window.location.hash.replace("#", "");
  return SECTIONS.some((s) => s.id === h) ? h : "accueil";
}
function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE });
}
function daysLeft(deadline) {
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}
// Prix réellement appliqué : le prix promotionnel s'il est défini et inférieur au prix normal
// (dupliqué à l'identique de pages/index.js, voir la note en tête de fichier).
function effectivePrice(p) {
  return p && p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price;
}
function formatEUR(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}
// ZENORIA_STEP3C2_V1 : une commande par carte non finalisee (pending, expiree, annulee) n'affiche pas son statut technique
function customerOrderBadge(o) {
  if (o.payment_method !== "transfer" && !CUSTOMER_VISIBLE_STATUSES.includes(o.status)) {
    return { label: "Paiement non finalisé", className: "bg-[#f3f1f5] text-[#8b737e]" };
  }
  return orderStatusInfo(o.status);
}

function ProductThumb({ item }) {
  const [err, setErr] = useState(false);
  const photo = item.product && Array.isArray(item.product.photos) ? item.product.photos[0] : null;
  const src = photo && item.product ? getMediaUrl(photo, item.product.slug) : null;
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" onError={() => setErr(true)} className="h-14 w-14 rounded-xl object-cover shrink-0 bg-[#f5edf1]" />
    );
  }
  return <div className="h-14 w-14 rounded-xl shrink-0 bg-[#f5edf1] grid place-items-center text-[#c9b6be] text-[10px] text-center px-1">{item.product_name || "Bijou"}</div>;
}

function FavThumb({ product, size = "h-16 w-16" }) {
  const [err, setErr] = useState(false);
  const src = product.photos && product.photos[0] ? getMediaUrl(product.photos[0], product.slug) : null;
  if (src && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setErr(true)} className={`${size} rounded-xl object-cover shrink-0 bg-[#f5edf1]`} />;
  }
  return <div className={`${size} rounded-xl shrink-0 bg-[#f5edf1] grid place-items-center text-[#c9b6be] text-[10px] text-center px-1`}>{product.name}</div>;
}

function Stars({ value, size = 14 }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= value ? "fill-[#b48a5a] text-[#b48a5a]" : "text-[#e2d6da]"} />
      ))}
    </span>
  );
}

function Timeline({ order }) {
  return (
    <div className="flex items-start" data-testid="order-timeline">
      {TRACKING_STEPS.map((s, i) => {
        const date = order.steps[s.status];
        const done = Boolean(date);
        return (
          <div key={s.status} className="flex-1 text-center text-[11px] text-[#8b737e] relative">
            {i > 0 && <span aria-hidden="true" className={`absolute top-3 right-1/2 w-full h-0.5 ${done ? "bg-emerald-500" : "bg-[#f0e7ea]"}`} />}
            <div className={`relative z-10 mx-auto w-6 h-6 rounded-full grid place-items-center text-[11px] ${done ? "bg-emerald-500 text-white" : "bg-[#f0e7ea] text-[#b9a6ae]"}`}>
              {done ? "✓" : i + 1}
            </div>
            <div className={`mt-1 ${done ? "text-[#412f3b] font-medium" : ""}`}>{s.label}</div>
            <div>{done ? formatDate(date) : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

function QuestionPanel({ order, contactCfg, onClose }) {
  const ref = order.reference;
  const subject = `Commande ${ref}`;
  const mailBody = `Bonjour,\n\nJ'ai une question au sujet de ma commande ${ref} :\n`;
  const waText = `Bonjour, j'ai une question au sujet de ma commande ${ref}.`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      // copie indisponible : la cliente peut sélectionner le texte à la main
    }
  };
  const channels = [];
  if (contactCfg.email.enabled && contactCfg.email.value) channels.push({ id: "email", label: "Par e-mail", href: buildMailtoLink(contactCfg.email.value, subject, mailBody) });
  if (contactCfg.whatsapp.enabled && contactCfg.whatsapp.value) channels.push({ id: "whatsapp", label: "WhatsApp", href: buildWhatsAppLink(contactCfg.whatsapp.value, waText) });
  if (contactCfg.signal.enabled && contactCfg.signal.value) channels.push({ id: "signal", label: "Signal", href: buildSignalLink(contactCfg.signal.value) });
  return (
    <div className="mt-3 rounded-xl border border-[#eadfe4] bg-[#fbf7f9] p-3" data-testid="question-panel">
      <p className="text-xs text-[#54434c] mb-2">Choisissez un canal : votre message mentionne déjà la commande {ref}.</p>
      {channels.length === 0 ? (
        <p className="text-xs text-[#8b737e]">Aucun canal de contact n&apos;est activé pour le moment.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <a key={c.id} href={c.href} target={c.id === "email" ? undefined : "_blank"} rel="noopener noreferrer" className="rounded-full bg-white border border-[#d9c5cc] px-3 py-1.5 text-xs text-[#412f3b] hover:bg-[#f5edf1]">
              {c.label}
            </a>
          ))}
          {contactCfg.signal.enabled && contactCfg.signal.value && (
            <button type="button" onClick={copy} className="rounded-full bg-white border border-[#d9c5cc] px-3 py-1.5 text-xs text-[#8f6075] hover:bg-[#f5edf1]">
              {copied ? "Message copié !" : "Copier le message pour Signal"}
            </button>
          )}
        </div>
      )}
      <button type="button" onClick={onClose} className="mt-2 text-[11px] text-[#8b737e] underline">Fermer</button>
    </div>
  );
}

// ZENORIA_INVOICE_STEP3_V1 : télécharge la facture PDF d'une commande. Le jeton de la session en cours est
// transmis à la route API, qui vérifie elle-même (côté base) que la commande appartient
// bien à la cliente connectée, ou qu'il s'agit d'un accès administrateur.
async function downloadInvoice(orderId, onError) {
  try {
    const { data } = await supabaseForInvoice.auth.getSession();
    const token = data && data.session ? data.session.access_token : null;
    if (!token) { onError("Connectez-vous pour télécharger votre facture."); return; }
    const res = await fetch(`/api/invoice/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      let message = "Impossible de générer la facture pour le moment.";
      try { const j = await res.json(); if (j && j.error) message = j.error; } catch (e) { /* réponse non JSON */ }
      onError(message);
      return;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
    a.href = url;
    a.download = match ? match[1] : `facture-${orderId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    onError("Impossible de générer la facture pour le moment.");
  }
}
// ZENORIA_AUTO_CANCEL_UI_V1 : bandeau rouge vif avant l'annulation automatique d'une commande par virement (texte validé)
function AutoCancelAlert({ order, graceDays }) {
  if (!order || order.status !== "pending_transfer" || !order.transfer_due_at) return null;
  if (!isAutoCancelAlert(order.transfer_due_at, graceDays)) return null;
  const at = autoCancelAt(order.transfer_due_at, graceDays);
  return (
    <div role="alert" data-testid="auto-cancel-alert" className="flex gap-2.5 rounded-xl border-2 border-[#e5484d] bg-[#fdecec] px-4 py-3 text-sm leading-5 text-[#b42318]">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        Votre virement n&apos;a pas encore été reçu. Sans réception avant le <strong>{formatAutoCancel(at)}</strong>, votre commande sera annulée automatiquement et votre bijou remis en vente.
      </span>
    </div>
  );
}
function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onOrderChanged, graceDays }) { // ZENORIA_STEP3C2_V1
  const [invoiceBusy, setInvoiceBusy] = useState(false); // ZENORIA_INVOICE_STEP3_V1
  const [invoiceError, setInvoiceError] = useState(""); // ZENORIA_INVOICE_STEP3_V1
  const isTransfer = order.payment_method === "transfer"; // ZENORIA_STEP3C2_V1
  const isFinished = CUSTOMER_VISIBLE_STATUSES.includes(order.status);
  const isCancelled = order.status === "cancelled";
  const badge = isTransfer || isFinished ? orderStatusInfo(order.status) : { label: "Paiement non finalisé", className: "bg-[#f3f1f5] text-[#8b737e]" };
  const total = Number(order.total) || 0;
  const [events, setEvents] = useState([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [deliverBusy, setDeliverBusy] = useState(false); // ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1
  const [deliverError, setDeliverError] = useState(""); // ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1
  useEffect(() => {
    if (!isTransfer) { setEvents([]); return undefined; }
    let alive = true;
    supabase.rpc("customer_order_events", { p_order_id: order.id }).then((res) => {
      if (alive) setEvents(res && !res.error && res.data ? res.data : []);
    });
    return () => { alive = false; };
  }, [order.id, isTransfer]);
  const cancelEvent = [...events].reverse().find((e) => e.event_status === "cancelled" && e.message);
  const cancelOrder = async () => {
    setCancelBusy(true);
    setCancelError("");
    try {
      const { error: err } = await supabase.rpc("customer_cancel_transfer_order", { p_order_id: order.id, p_note: cancelNote.trim() || null });
      if (err) throw err;
      setCancelOpen(false);
      if (onOrderChanged) onOrderChanged();
    } catch (err) {
      setCancelError("Impossible d'annuler la commande pour le moment. Réessayez, ou contactez-nous.");
    }
    setCancelBusy(false);
  };
  // ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1 : confirmation de réception par la cliente (uniquement depuis "shipped")
  const confirmDelivery = async () => {
    setDeliverBusy(true);
    setDeliverError("");
    try {
      const { error: err } = await supabase.rpc("customer_confirm_delivery", { p_order_id: order.id });
      if (err) throw err;
      if (onOrderChanged) onOrderChanged();
    } catch (err) {
      setDeliverError("Impossible de confirmer la réception pour le moment. Réessayez, ou contactez-nous.");
    }
    setDeliverBusy(false);
  };
  return (
    <div data-testid={`order-detail-${order.id}`}>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-[#8f6075] mb-3">
        <ChevronLeft size={16} /> Toutes mes commandes
      </button>
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="font-serif text-2xl text-[#412f3b]">Commande {order.reference}</h2>
        <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${badge.className}`}>{badge.label}</span>
      </div>
      <p className="text-xs text-[#8b737e] mt-1">Passée le {formatDate(order.created_at)}</p>

      {isTransfer && order.status === "pending_transfer" ? (
        <div className="mt-5 space-y-3">
                    <AutoCancelAlert order={order} graceDays={graceDays} />
          <TransferInstructions orderId={order.id} contactCfg={contactCfg} />
          <button type="button" onClick={() => setCancelOpen(true)} data-testid="account-cancel-transfer" className="rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1]">Annuler ma commande</button>
        </div>
      ) : isCancelled ? (
        <div className="mt-5 rounded-xl bg-white border border-[#eee2e5] px-4 py-3 text-sm text-[#54434c]" data-testid="order-cancelled-note">
          <div className="font-medium text-[#412f3b]">Commande annulée</div>
          {cancelEvent && <div className="mt-1">{cancelEvent.message}</div>}
        </div>
      ) : isFinished ? (
        <div className="mt-5"><Timeline order={order} /></div>
      ) : null}

      {order.carrier && (
        <div className="mt-4 rounded-xl bg-[#fbf7f9] px-4 py-3 flex items-center gap-2 text-sm text-[#54434c]">
          {order.carrier === "En main propre" ? <HandIcon size={16} className="text-[#8f6075]" /> : <Truck size={16} className="text-[#8f6075]" />} {order.carrier === "En main propre" ? "Remise en main propre" : order.carrier} {/* ZENORIA_HAND_DELIVERY_V1 */}
          {order.tracking_number && <span className="text-[#8b737e] min-w-0 break-words">· {order.carrier === "En main propre" ? "" : "suivi "}{order.tracking_number}</span>}
        </div>
      )}

      {/* ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1 : bouton visible uniquement si la commande est expédiée mais pas encore livrée */}
      {order.status === "shipped" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={confirmDelivery}
            disabled={deliverBusy}
            data-testid="confirm-delivery"
            className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deliverBusy ? "Confirmation…" : "Confirmer la réception"}
          </button>
          {deliverError && <p className="mt-2 text-[12px] text-red-600">{deliverError}</p>}
        </div>
      )}

      <h3 className="font-serif text-lg text-[#412f3b] mt-6 mb-2">Bijoux</h3>
      <div className="space-y-2">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#eee2e5] p-2.5">
            <ProductThumb item={it} />
            <div className="min-w-0 flex-1">
              {it.product && it.product.active && it.product.slug ? (
                <a href={`/#bague=${encodeURIComponent(it.product.slug)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#412f3b] truncate hover:underline block">{it.product_name}</a>
              ) : (
                <div className="text-sm font-medium text-[#412f3b] truncate">{it.product_name}</div>
              )}
              <div className="text-xs text-[#8b737e]">Quantité {it.qty} · {formatOrderPrice(it.product_price)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl bg-[#fbf7f9] p-3 text-sm">
          <div className="font-medium text-[#412f3b] mb-1">Livraison</div>
          <div className="text-[#54434c] leading-6">
            {order.shipping_full_name}<br />
            {order.shipping_address_line1}{order.shipping_address_line2 ? <><br />{order.shipping_address_line2}</> : null}<br />
            {order.shipping_postal_code} {order.shipping_city}<br />
            {order.shipping_country}
          </div>
        </div>
        <div className="rounded-xl bg-[#fbf7f9] p-3 text-sm">
          <div className="flex justify-between py-0.5"><span className="text-[#8b737e]">Sous-total</span><span>{formatOrderPrice(order.subtotal)}</span></div>
          {Number(order.discount) > 0 && <div className="flex justify-between py-0.5"><span className="text-[#8b737e]">Remise</span><span>- {formatOrderPrice(order.discount)}</span></div>}
          <div className="flex justify-between py-0.5"><span className="text-[#8b737e]">Livraison</span><span>{Number(order.shipping) > 0 ? formatOrderPrice(order.shipping) : "Offerte"}</span></div>
          <div className="flex justify-between pt-1.5 mt-1 border-t border-[#eadfe4] font-medium text-[#412f3b]"><span>Total</span><span>{formatOrderPrice(total)}</span></div>
        </div>
      </div>


      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={() => setQuestionOpen(questionOpen ? null : order.id)} className="rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1]">
          Une question sur cette commande ?
        </button>
        {/* ZENORIA_INVOICE_STEP3_V1 : facture PDF, générée à la demande (recomposée depuis des données figées) */}
        {isFinished && (
          <button
            type="button"
            onClick={async () => { setInvoiceBusy(true); setInvoiceError(""); await downloadInvoice(order.id, setInvoiceError); setInvoiceBusy(false); }}
            disabled={invoiceBusy}
            data-testid="invoice-download-btn"
            className="flex items-center gap-2 rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1] disabled:opacity-50"
          >
            <FileDown size={15} /> {invoiceBusy ? "Génération…" : "Télécharger la facture"}
          </button>
        )}
      </div>
      {/* ZENORIA_STEP3C2_V1 : mises a jour du vendeur (prolongation, confirmation, annulation), note facultative visible */}
      {isTransfer && events.filter((e) => e.message).length > 0 && (
        <div className="mt-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3" data-testid="order-updates">
          <div className="text-xs font-medium text-[#8b737e] mb-2">Mises à jour</div>
          <ul className="space-y-1.5">
            {events.filter((e) => e.message).map((e, i) => (
              <li key={i} className="text-[13px] text-[#54434c]"><span className="text-[11px] text-[#8b737e]">{formatDate(e.event_at)}</span> — {e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {invoiceError && <div role="alert" className="mt-3 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{invoiceError}</div>}
      {questionOpen === order.id && <QuestionPanel order={order} contactCfg={contactCfg} onClose={() => setQuestionOpen(null)} />}
      {cancelOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" data-testid="account-cancel-dialog">
          <div className="w-full max-w-md rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">
            <h3 className="font-serif text-xl text-[#412f3b]">Annuler cette commande ?</h3>
            <p className="mt-2 text-sm text-[#54434c]">Votre bijou sera remis en vente. Cette action est définitive.</p>
            <label className="mt-3 block text-[12px] text-[#54434c]">
              Pouvez-vous nous dire pourquoi ? (facultatif)
              <textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={500} rows={3} data-testid="account-cancel-note" className="mt-1 w-full rounded-xl border border-[#eadfe4] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#8f6075]" />
            </label>
            {cancelError && <p role="alert" className="mt-2 text-[12px] text-red-600">{cancelError}</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={cancelOrder} disabled={cancelBusy} data-testid="account-cancel-confirm" className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm disabled:opacity-60">{cancelBusy ? "Annulation…" : "Oui, annuler"}</button>
              <button type="button" onClick={() => setCancelOpen(false)} className="rounded-full border border-[#d9c5cc] px-5 h-10 text-sm hover:bg-[#f5edf1]">Retour</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Compte() {
  const [user, setUser] = useState(undefined); // undefined : vérification en cours ; null : non connectée
  const [isAdmin, setIsAdmin] = useState(false);
  const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS);
  const [section, setSection] = useState("accueil");
  const [heroUrl, setHeroUrl] = useState(DEFAULT_HERO);
  // ZENORIA_COMPTE_SEASON_FX_V1 : reglage lu dans site_settings (meme cle que l'accueil) ; nowMs rempli seulement
  // apres l'affichage, pour que le rendu du serveur ne depende jamais de l'heure (hydratation stable).
  const [fxSetting, setFxSetting] = useState(() => parseSeasonFxSetting(null));
  const [nowMs, setNowMs] = useState(null);
  useEffect(() => { setNowMs(Date.now()); }, []);

  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [contactCfg, setContactCfg] = useState(DEFAULT_CONTACT);
  const [questionOpenId, setQuestionOpenId] = useState(null);
    const [ordersVersion, setOrdersVersion] = useState(0);
  // ZENORIA_ACCOUNT_NEWS_V1 : donnees des nouveautes (null = lecture non reussie)
  const [newsRows, setNewsRows] = useState(null);
  const [newsReviews, setNewsReviews] = useState(null);
  const [newsReady, setNewsReady] = useState(false);
  const [graceDays, setGraceDays] = useState(DEFAULT_BANK_TRANSFER.grace_days); // ZENORIA_AUTO_CANCEL_UI_V1 // ZENORIA_STEP3C2_V1 : recharge apres annulation
  const [logoutAsk, setLogoutAsk] = useState(false); // fenetre "garder le panier ?" a la deconnexion
  const [accountMenuOpen, setAccountMenuOpen] = useState(false); // ZENORIA_COMPTE_HEADER_AUTH_V1 : menu « Connecté(e) en tant que » de l'en-tête (PC)
  const [logoutCartCount, setLogoutCartCount] = useState(0);
  useEffect(() => {
    if (!logoutAsk) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setLogoutAsk(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logoutAsk]);

  // --- Mes avis (étape 1.4) ---
  const [reviewItems, setReviewItems] = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewToast, setReviewToast] = useState("");
  const [reviewForm, setReviewForm] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSending, setReviewSending] = useState(false);
  const [withdrawConfirmId, setWithdrawConfirmId] = useState(null);

  // --- Mes favoris (étape 1.4) ---
  const [favLoading, setFavLoading] = useState(false);
  const [favLoaded, setFavLoaded] = useState(false);
  const [favProducts, setFavProducts] = useState([]);
  const [favMsg, setFavMsg] = useState("");

  const goLogin = useCallback(() => {
    try {
      window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ to: "/compte" + window.location.hash, at: Date.now() }));
    } catch (e) {
      // stockage indisponible : la cliente reviendra simplement à l'accueil
    }
    window.location.replace("/?connexion=compte");
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data && data.session ? data.session.user : null;
      if (!alive) return;
      if (!u) {
        setUser(null);
        goLogin();
        return;
      }
      setUser(u);
      const [adm, cfg, hero, fx] = await Promise.all([
        supabase.from("admin_users").select("user_id").eq("user_id", u.id).maybeSingle(),
        fetchReviewsSetting(supabase),
        supabase.from(SITE_MEDIA_TABLE).select("path").eq("slot", SITE_SLOT_ACCOUNT_HERO).maybeSingle(),
        supabase.from(SITE_SETTINGS_TABLE).select("value").eq("key", SEASON_FX_KEY).maybeSingle(), // ZENORIA_COMPTE_SEASON_FX_V1
      ]);
      if (!alive) return;
      setIsAdmin(Boolean(adm && !adm.error && adm.data));
      setReviewsCfg(cfg);
      if (hero && !hero.error && hero.data && hero.data.path) setHeroUrl(getMediaUrl(hero.data.path, "site"));
      // ZENORIA_COMPTE_SEASON_FX_V1 : ligne absente ou illisible -> réglage par défaut (automatique), comme sur l'accueil
      setFxSetting(parseSeasonFxSetting(fx && !fx.error && fx.data ? fx.data.value : null));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        window.location.replace("/");
      }
    });
    return () => {
      alive = false;
      if (listener && listener.subscription) listener.subscription.unsubscribe();
    };
  }, [goLogin]);

  useEffect(() => {
    const sync = () => setSection(readHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Commandes, canaux de contact et bijoux à évaluer (pour le raccourci de l'accueil)
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    (async () => {
      setOrdersLoading(true);
            const [ordersRes, contactRes, reviewRes, graceRes] = await Promise.all([
        supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }), // ZENORIA_ACCOUNT_FIX1_V1 : filtre explicite (ne pas dépendre de la RLS, qui laisse un compte admin tout voir) ; ZENORIA_STEP3C2_V1 : plus de filtre de statut ici (tri effectue ensuite, voir plus bas)
        supabase.from(SITE_SETTINGS_TABLE).select("value").eq("key", CONTACT_KEY).maybeSingle(),
                supabase.rpc("list_reviewable_items"),
        supabase.rpc("transfer_grace_days"),
      ]);
      if (!alive) return;
      setContactCfg(parseContactSetting(contactRes && !contactRes.error && contactRes.data ? contactRes.data.value : null));
            setReviewItems((reviewRes && !reviewRes.error && reviewRes.data) || []);
      if (graceRes && !graceRes.error && typeof graceRes.data === "number") setGraceDays(graceRes.data);

      const list = (ordersRes && !ordersRes.error && ordersRes.data) || [];
      if (list.length === 0) {
        setOrders([]);
        // ZENORIA_ACCOUNT_NEWS_V1 : aucune commande -> point de depart vide (sauf si la lecture des commandes a echoue)
        if (ordersRes && !ordersRes.error) { setNewsRows([]); setNewsReviews([]); }
        setNewsReady(true);
        setOrdersLoading(false);
        return;
      }
      const ids = list.map((o) => o.id);
      const [itemsRes, historyRes, newsReviewsRes] = await Promise.all([
        supabase.from("order_items").select("order_id, product_id, product_name, product_price, qty").in("order_id", ids),
        supabase.rpc("customer_account_news"), // ZENORIA_ACCOUNT_NEWS_V1 : fonction SQL (une cliente ne lit pas order_status_history en direct : la RLS est reservee a l administration)
        supabase.from("reviews").select("id, status, reply, reply_at").in("order_id", ids), // ZENORIA_ACCOUNT_NEWS_V1 : lecture legere pour la pastille de Mes avis
      ]);
      if (!alive) return;
      const items = (itemsRes && !itemsRes.error && itemsRes.data) || [];
      const history = (historyRes && !historyRes.error && historyRes.data) || [];
      // ZENORIA_ACCOUNT_NEWS_V1 : null si la lecture a echoue (le point de depart n est alors pas pose)
      setNewsRows(historyRes && !historyRes.error && Array.isArray(historyRes.data) ? historyRes.data : null);
      setNewsReviews(newsReviewsRes && !newsReviewsRes.error && Array.isArray(newsReviewsRes.data) ? newsReviewsRes.data : null);
      setNewsReady(true);
      const productIds = Array.from(new Set(items.map((i) => i.product_id).filter((v) => v !== null && v !== undefined)));
      const prodRes = productIds.length
        ? await supabase.from("products").select("id, slug, photos, active").in("id", productIds)
        : { data: [], error: null };
      if (!alive) return;
      const productsById = {};
      (prodRes.data || []).forEach((p) => { productsById[p.id] = p; });
      const enriched = list.map((o) => {
        const oItems = items.filter((i) => i.order_id === o.id).map((i) => ({ ...i, product: i.product_id ? productsById[i.product_id] || null : null }));
        const steps = {};
        history.filter((h) => h.order_id === o.id && h.status !== "cancelled").forEach((h) => { steps[h.status] = h.changed_at; }); // ZENORIA_ACCOUNT_NEWS_V1 : la fonction renvoie aussi les annulations (comptees dans la pastille, pas dans le suivi)
        return { ...o, reference: formatOrderReference(o), items: oItems, steps };
      });
      // ZENORIA_STEP3C2_V1 : virement (tout statut) + commandes carte abouties + 5 dernieres commandes carte non abouties
      const transferOrders = enriched.filter((o) => o.payment_method === "transfer");
      const cardFinished = enriched.filter((o) => o.payment_method !== "transfer" && CUSTOMER_VISIBLE_STATUSES.includes(o.status));
      const cardUnfinished = enriched.filter((o) => o.payment_method !== "transfer" && !CUSTOMER_VISIBLE_STATUSES.includes(o.status)).slice(0, 5);
      // ZENORIA_COMPTE_ORDERS_SORT_V1 : un seul tri sur la liste finale (les 3 blocs ci-dessus ne sont tries que chacun de leur cote).
      // Plus recente d'abord ; a date egale ou invalide, id decroissant. Les regles de visibilite ci-dessus sont inchangees.
      const byNewest = (a, b) => {
        const ta = Date.parse(a.created_at);
        const tb = Date.parse(b.created_at);
        const da = Number.isNaN(ta) ? -Infinity : ta;
        const db = Number.isNaN(tb) ? -Infinity : tb;
        if (da !== db) return db > da ? 1 : -1;
        return Number(b.id) - Number(a.id);
      };
      setOrders([...transferOrders, ...cardFinished, ...cardUnfinished].sort(byNewest));
      setOrdersLoading(false);
    })();
    return () => { alive = false; };
  }, [user, ordersVersion]); // ZENORIA_STEP3C2_V1 : recharge apres annulation

  const showReviews = Boolean(reviewsCfg.enabled || isAdmin);
  const canUseReviews = Boolean(user) && showReviews;
  const starsOnly = reviewsCfg.mode === "stars";
  const reviewableCount = reviewItems.filter((r) => r.can_review).length;
  // ZENORIA_ACCOUNT_NEWS_V1 : pastille rouge de nouveautes (memoire dans le navigateur, par compte)
  const accountNews = useAccountNews({
    userId: user ? user.id : null,
    ready: newsReady,
    orders,
    rows: newsRows,
    reviews: newsReviews,
    reviewsEnabled: showReviews,
    section,
  });

  // Chargement de « Mes avis », à l'ouverture de la rubrique
  const loadReviews = useCallback(async () => {
    if (!canUseReviews) return;
    setReviewsLoading(true);
    setReviewError("");
    try {
      const [a, b] = await Promise.all([
        supabase.rpc("list_reviewable_items"),
        supabase
          .from("reviews")
          .select("id, order_id, product_id, rating, comment, status, refusal_reason, reply, reply_at, created_at, published_at, is_test, products(name)")
          .order("created_at", { ascending: false }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      setReviewItems(a.data || []);
      setMyReviews(b.data || []);
    } catch (err) {
      setReviewError(reviewErrorMessage(err));
    }
    setReviewsLoading(false);
    setReviewsLoaded(true);
  }, [canUseReviews]);

  useEffect(() => {
    if (section === "avis" && canUseReviews && !reviewsLoaded) loadReviews();
  }, [section, canUseReviews, reviewsLoaded, loadReviews]);

  useEffect(() => {
    if (!reviewToast) return undefined;
    const t = setTimeout(() => setReviewToast(""), 4000);
    return () => clearTimeout(t);
  }, [reviewToast]);

  const openReviewForm = (it) => {
    setReviewForm(it);
    setReviewRating(0);
    setReviewComment("");
    setReviewError("");
  };
  const sendReview = async () => {
    if (!reviewForm || reviewRating < 1) return;
    setReviewSending(true);
    setReviewError("");
    try {
      const { error: err } = await supabase.rpc("submit_review", {
        p_order_id: reviewForm.order_id,
        p_product_id: reviewForm.product_id,
        p_rating: reviewRating,
        p_comment: starsOnly ? null : reviewComment,
      });
      if (err) throw err;
      setReviewForm(null);
      setReviewToast(`Merci ! Votre avis sera relu sous ${REVIEWS_RULES.moderationDays} jours ouvrés maximum.`);
      await loadReviews();
    } catch (err) {
      setReviewError(reviewErrorMessage(err));
    }
    setReviewSending(false);
  };
  const withdrawReview = async (id) => {
    setReviewError("");
    try {
      const { error: err } = await supabase.rpc("withdraw_review", { p_review_id: id });
      if (err) throw err;
      setWithdrawConfirmId(null);
      setReviewToast("Votre avis a été retiré.");
      await loadReviews();
    } catch (err) {
      setReviewError(reviewErrorMessage(err));
    }
  };
  const reviewProductName = (r) => {
    if (r.products && r.products.name) return r.products.name;
    const it = reviewItems.find((i) => i.order_id === r.order_id && i.product_id === r.product_id);
    return it ? it.product_name : "Bijou";
  };

  // Chargement de « Mes favoris », à l'ouverture de la rubrique
  const loadFavorites = useCallback(async () => {
    if (!user) return;
    setFavLoading(true);
    try {
      const favRes = await supabase.from("customer_favorites").select("product_id").eq("user_id", user.id);
      const ids = (favRes && !favRes.error && favRes.data) ? favRes.data.map((r) => r.product_id) : [];
      if (ids.length === 0) {
        setFavProducts([]);
      } else {
                // ZENORIA_FAV_STOCK_V1 : même règle que la vitrine (stock, paiements en cours, pièces uniques réservées ou vendues)
        const [prodRes, pieceRes, availRes] = await Promise.all([
          supabase.from("products").select("id, slug, name, price, promo_price, photos, active, stock, is_unique").in("id", ids),
          supabase.rpc("public_piece_states").then((r) => r, () => ({ data: null, error: true })),
          supabase.rpc("public_stock_states").then((r) => r, () => ({ data: null, error: true })),
        ]);
        const pieceMap = pieceStateMap(pieceRes && !pieceRes.error ? pieceRes.data : null);
        const availMap = availRes && !availRes.error && Array.isArray(availRes.data) ? stockStateMap(availRes.data) : null;
        const byId = {};
        (prodRes.data || []).forEach((p) => {
          byId[p.id] = {
            ...p,
            promoPrice: p.promo_price,
            isUnique: p.is_unique === true,
            pieceState: pieceMap.get(p.id) || null,
            available: availMap && availMap.has(p.id) ? availMap.get(p.id) : null,
          };
        });
        setFavProducts(ids.map((id) => byId[id]).filter(Boolean));
      }
    } catch (e) {
      // favoris illisibles : liste vide plutôt qu'une erreur bloquante
      setFavProducts([]);
    }
    setFavLoading(false);
    setFavLoaded(true);
  }, [user]);

  useEffect(() => {
    if (section === "favoris" && user && !favLoaded) loadFavorites();
  }, [section, user, favLoaded, loadFavorites]);

  useEffect(() => {
    if (!favMsg) return undefined;
    const t = setTimeout(() => setFavMsg(""), 3500);
    return () => clearTimeout(t);
  }, [favMsg]);

  const removeFromFavorites = async (productId) => {
    setFavProducts((prev) => prev.filter((p) => p.id !== productId));
    try {
      await supabase.from("customer_favorites").delete().eq("user_id", user.id).eq("product_id", productId);
    } catch (e) {
      // la suppression a échoué silencieusement : on garde la liste optimiste, un rechargement la corrigera
    }
    setFavMsg("Retiré des favoris.");
  };

  const addFavoriteToCart = (p) => {
    try {
      let cart = { items: [], promo: null };
      try {
        const raw = window.localStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          cart = { items: Array.isArray(saved.items) ? saved.items.slice() : [], promo: saved.promo || null };
        }
      } catch (e) {
        // panier illisible : on repart d'un panier vide
      }
      const existing = cart.items.find((c) => c.id === p.id);
      const qty = p.is_unique === true ? 1 : (existing ? existing.qty : 0) + 1;
      if (existing) existing.qty = qty;
      else cart.items.push({ id: p.id, qty });
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      window.location.href = "/?panier=compte";
    } catch (e) {
      setFavMsg("Impossible d'ajouter ce bijou au panier pour le moment.");
    }
  };

  const visible = SECTIONS.filter((s) => !s.reviews || showReviews);
  const current = visible.find((s) => s.id === section) || visible[0];

  const go = (id) => {
    window.history.replaceState(null, "", "#" + id);
    setSection(id);
    setSelectedOrderId(null);
    setQuestionOpenId(null);
    // ZENORIA_ACCOUNT_FIX1_V1 : plus de retour forcé en haut de page (le menu reste visible, sticky)
  };

  // Le panier est enregistre dans le navigateur (meme cle que pages/index.js).
  const CART_KEY = "zenoria_cart_v2";
  const readCartCount = () => {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      return saved && Array.isArray(saved.items) ? saved.items.reduce((n, it) => n + (Number(it && it.qty) || 0), 0) : 0;
    } catch (e) {
      return 0;
    }
  };
  // ZENORIA_ACCOUNT_PANIER_V1 : badge du panier dans le header partage
  const [headerCartCount, setHeaderCartCount] = useState(0);
  useEffect(() => {
    setHeaderCartCount(readCartCount());
  }, []);
  const finishLogout = async (mode) => {
    setLogoutAsk(false);
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      const items = mode === "clear" ? [] : saved && Array.isArray(saved.items) ? saved.items : [];
      window.localStorage.setItem(CART_KEY, JSON.stringify({ items, promo: "" })); // le code promo ne suit jamais
    } catch (e) {
      // stockage illisible : on se deconnecte quand meme
    }
    await supabase.auth.signOut();
    window.location.replace("/");
  };
  const logout = async () => {
    const n = readCartCount();
    if (n > 0) {
      setLogoutCartCount(n);
      setLogoutAsk(true);
      return;
    }
    await finishLogout("empty");
  };


  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;
  const finishedOrders = orders.filter((o) => CUSTOMER_VISIBLE_STATUSES.includes(o.status)); // ZENORIA_STEP3C2_V1
  const pendingTransferOrders = orders.filter((o) => o.status === "pending_transfer"); // ZENORIA_STEP3C2_V1
  const lastOrder = finishedOrders[0] || null;
  const maxChars = REVIEWS_RULES.maxCommentLength;

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Mon compte — Zenoria</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <SiteHeader
        logoHref="/"
        showSearch={false}
        showAccount={true}
        user={user} // ZENORIA_COMPTE_HEADER_AUTH_V1 : sans user, le menu mobile affichait « Connexion / Créer un compte » même connectée
        isAdmin={isAdmin}
        authLoading={user === undefined}
        accountMenuOpen={accountMenuOpen}
        onAccountClick={() => setAccountMenuOpen((v) => !v)}
        onAccountMenuClose={() => setAccountMenuOpen(false)}
        onLogout={() => { setAccountMenuOpen(false); logout(); }}
        onFavClick={() => go("favoris")}
        accountBadge={accountNews.total} // ZENORIA_ACCOUNT_NEWS_V1
        showCart={true}
        cartCount={headerCartCount}
        onCartClick={() => window.location.assign("/#panier")}
      />

      {!user ? (
        <main className="max-w-6xl mx-auto px-6 py-24 text-center text-sm text-[#8b737e]" data-testid="account-loading">
          {user === null ? "Redirection vers la connexion…" : "Chargement de votre espace…"}
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8" data-testid="account-page">
          {/* BANDEAU D'ACCUEIL — rendu validé « Proposition B · Ivoire champagne ».
              Photo entière calée à droite ; zone du bijou intacte ; fondu progressif vers la gauche ;
              fond champagne + halo chaud ; voile limité à la zone du texte.
              Image modifiable dans Admin › Contenu du site (emplacement account_hero). */}
          <section
            data-testid="account-hero"
            className="relative rounded-t-[1.5rem] overflow-hidden h-[244px] sm:h-[264px] flex items-center mb-0 border border-[#efe2d6]"
            style={{
              background: [
                "radial-gradient(ellipse 34% 75% at 17% 45%, rgba(255,244,232,.85) 0%, rgba(255,244,232,0) 100%)",
                "linear-gradient(100deg, #fcf7f0 0%, #f9f0e5 35%, #f6eae0 60%, #f4e7de 100%)",
              ].join(","),
            }}
          >
            <img
              src={heroUrl}
              alt=""
              aria-hidden="true"
              draggable="false"
              onError={() => setHeroUrl(DEFAULT_HERO)}
              className="absolute inset-y-0 right-[-26%] sm:right-0 h-full w-auto max-w-none select-none pointer-events-none"
              style={{
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.12) 10%, rgba(0,0,0,.4) 20%, rgba(0,0,0,.75) 31%, #000 42%)",
                maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.12) 10%, rgba(0,0,0,.4) 20%, rgba(0,0,0,.75) 31%, #000 42%)",
              }}
            />
            <div aria-hidden="true" className="absolute inset-0 hidden sm:block" style={{ background: "linear-gradient(90deg, rgba(252,247,240,.6) 0%, rgba(250,243,234,.5) 22%, rgba(249,240,229,.18) 38%, rgba(249,240,229,0) 48%)" }} />
            <div aria-hidden="true" className="absolute inset-0 sm:hidden" style={{ background: "linear-gradient(90deg, rgba(252,247,240,.75) 0%, rgba(250,243,234,.55) 34%, rgba(249,240,229,.15) 50%, rgba(249,240,229,0) 58%)" }} />

            {/* ZENORIA_COMPTE_HERO_FLUSH_V1 : animation saisonniere sur le bandeau (au-dessus de la photo, derriere le texte) ; meme reglage admin que l'accueil */}
            {nowMs !== null && (() => {
              const fxSeason = pickFxSeason(fxSetting, resolveFxSeason(fxSetting, null, new Date(nowMs)));
              return fxSeason ? (
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
                  <SeasonFx season={fxSeason} />
                </div>
              ) : null;
            })()}

            <div className="relative pl-5 pr-3 sm:px-14 max-w-[56%] sm:max-w-md">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[.28em] text-[#b48a5a]">Mon compte</p>
              <h1 className="font-serif text-3xl sm:text-5xl text-[#4a3743] mt-1.5 leading-tight">Bonjour</h1>
              <span aria-hidden="true" className="block h-px w-12 sm:w-14 mt-2.5 mb-2" style={{ background: "linear-gradient(90deg, #c9a679, rgba(201,166,121,0))" }} />
              <p className="text-[11px] sm:text-sm text-[#705e68] truncate" title={user.email}>{user.email}</p>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-0 lg:gap-6 -mt-px">
            {/* MENU : à gauche sur ordinateur, onglets défilants sur mobile. ZENORIA_COMPTE_LAYOUT_FIX_V1 : grid-cols-1 empeche la barre d'onglets d'elargir la page sur mobile */}
            <nav aria-label="Rubriques de mon compte" className="lg:self-start lg:sticky lg:top-24">
              <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible rounded-none lg:rounded-b-2xl bg-white border border-[#eadfe4] p-1.5 lg:p-2.5">
                {visible.map((s) => {
                  const Icon = s.icon;
                  const on = current && current.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(s.id)}
                      aria-current={on ? "page" : undefined}
                      data-testid={`account-nav-${s.id}`}
                      className={`shrink-0 flex items-center gap-2 whitespace-nowrap rounded-full lg:rounded-xl px-3.5 py-2 text-sm text-left ${on ? "bg-[#f5edf1] text-[#412f3b] font-medium" : "text-[#54434c] hover:bg-[#fbf7f9]"}`}
                    >
                      <Icon size={16} className="text-[#8f6075]" /> {s.label}
                      {accountNews.tabLabels[s.id] ? (
                        <span data-testid={`account-nav-badge-${s.id}`} className="inline-grid h-[18px] min-w-[18px] px-1 rounded-full bg-[#c0392b] text-white text-[10px] font-medium leading-none place-items-center">
                          {accountNews.tabLabels[s.id]}
                          <span className="sr-only"> nouveautés</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={logout}
                  data-testid="account-logout"
                  className="hidden lg:flex items-center gap-2 rounded-xl px-3.5 py-2 mt-1 text-sm text-[#8b737e] border-t border-[#eadfe4] hover:bg-[#fbf7f9]"
                >
                  <LogOut size={16} /> Se déconnecter
                </button>
              </div>
            </nav>

            {/* CONTENU DE LA RUBRIQUE */}
            <section data-testid={`account-section-${current ? current.id : "accueil"}`} className="rounded-t-none rounded-b-2xl bg-white border border-[#eadfe4] p-6 min-h-[260px] -mt-px lg:mt-0">
              {current && current.id === "accueil" && (
                <div data-testid="section-accueil">
                  <h2 className="font-serif text-2xl text-[#412f3b] mb-4">Accueil</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                    <button type="button" onClick={() => go("commandes")} className="text-left rounded-2xl border border-[#eee2e5] p-4 hover:border-[#d9c5cc]">
                      <div className="font-serif text-2xl text-[#412f3b]">{ordersLoading ? "…" : finishedOrders.length}</div>
                      <div className="text-xs text-[#8b737e]">commande{finishedOrders.length > 1 ? "s" : ""}</div>
                    </button>
                    {showReviews && (
                      <button type="button" onClick={() => go("avis")} className="text-left rounded-2xl border border-[#eee2e5] p-4 hover:border-[#d9c5cc]">
                        <div className="font-serif text-2xl text-[#412f3b]">{reviewableCount}</div>
                        <div className="text-xs text-[#8b737e]">bijou{reviewableCount > 1 ? "x" : ""} à évaluer</div>
                      </button>
                    )}
                    <button type="button" onClick={() => go("favoris")} className="text-left rounded-2xl border border-[#eee2e5] p-4 hover:border-[#d9c5cc]">
                      <div className="font-serif text-2xl text-[#412f3b]">{favLoaded ? favProducts.length : "…"}</div>
                      <div className="text-xs text-[#8b737e]">favori{favProducts.length > 1 ? "s" : ""}</div>
                    </button>
                  </div>

                  {ordersLoading ? (
                    <p className="text-sm text-[#8b737e]">Chargement…</p>
                  ) : lastOrder ? (
                    <div className="rounded-2xl border border-[#eee2e5] p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-serif text-lg text-[#412f3b]">Dernière commande</h3>
                        <button type="button" onClick={() => { setSelectedOrderId(lastOrder.id); go("commandes"); }} className="text-xs text-[#8f6075] underline">Voir le détail</button>
                      </div>
                      <div className="flex items-center gap-3">
                        {lastOrder.items[0] && <ProductThumb item={lastOrder.items[0]} />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">Commande {lastOrder.reference}</div>
                          <div className="text-xs text-[#8b737e]">Passée le {formatDate(lastOrder.created_at)} · {lastOrder.items.length} bijou{lastOrder.items.length > 1 ? "x" : ""} · {formatOrderPrice(lastOrder.total)}</div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${orderStatusInfo(lastOrder.status).className}`}>{orderStatusInfo(lastOrder.status).label}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[#eee2e5] p-6 text-center">
                      <p className="font-serif text-xl text-[#412f3b] mb-1">Bienvenue chez Zenoria</p>
                      <p className="text-sm text-[#8b737e] mb-4">Vous n&apos;avez pas encore de commande. Vous retrouverez ici son suivi dès votre premier achat.</p>
                      <a href="/" className="inline-block rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 leading-10 text-sm">Découvrir les créations</a>
                    </div>
                  )}
                  {pendingTransferOrders.map((o) => (
                    <div key={o.id} className="mt-4 rounded-2xl border border-[#eee2e5] p-4" data-testid={`home-pending-transfer-${o.id}`}>
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="font-serif text-lg text-[#412f3b]">Commande en attente de virement</h3>
                        <button type="button" onClick={() => { setSelectedOrderId(o.id); go("commandes"); }} className="text-xs text-[#8f6075] underline">Voir les instructions</button>
                      </div>
                                            <div className="text-sm text-[#54434c]">Commande {o.reference} · {formatOrderPrice(o.total)}{o.transfer_due_at ? <> · à régler avant le {formatDate(o.transfer_due_at)}</> : null}</div>
                      {isAutoCancelAlert(o.transfer_due_at, graceDays) && <div className="mt-2"><AutoCancelAlert order={o} graceDays={graceDays} /></div>}
                    </div>
                  ))}
                </div>
              )}
              {current && current.id === "commandes" && (
                <div data-testid="section-commandes">
                  {selectedOrder ? (
                    <OrderDetail
                      order={selectedOrder}
                      contactCfg={contactCfg}
                      questionOpen={questionOpenId}
                      setQuestionOpen={setQuestionOpenId}
                      onBack={() => setSelectedOrderId(null)}
                                            onOrderChanged={() => { setSelectedOrderId(null); setOrdersVersion((v) => v + 1); }} // ZENORIA_STEP3C2_V1
                      graceDays={graceDays}
                    />
                  ) : (
                    <>
                      <h2 className="font-serif text-2xl text-[#412f3b] mb-1">Mes commandes</h2>
                      <p className="text-xs text-[#8b737e] mb-4">Vos commandes abouties, vos commandes en attente de virement et vos 5 derniers paiements par carte non finalisés apparaissent ici.</p>
                      {ordersLoading ? (
                        <p className="text-sm text-[#8b737e]">Chargement…</p>
                      ) : orders.length === 0 ? (
                        <p className="text-sm text-[#8b737e]">Vous n&apos;avez pas encore de commande.</p>
                      ) : (
                        <div className="space-y-2">
                          {orders.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => setSelectedOrderId(o.id)}
                              data-testid={`order-row-${o.id}`}
                              className="w-full text-left flex items-center gap-3 rounded-2xl border border-[#eee2e5] p-3 hover:border-[#d9c5cc]"
                            >
                              {o.items[0] && <ProductThumb item={o.items[0]} />}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">Commande {o.reference}</div>
                                <div className="text-xs text-[#8b737e]">Passée le {formatDate(o.created_at)} · {o.items.length} bijou{o.items.length > 1 ? "x" : ""} · {formatOrderPrice(o.total)}</div>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${customerOrderBadge(o).className}`}>{customerOrderBadge(o).label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {current && current.id === "avis" && (
                <div data-testid="section-avis">
                  <h2 className="font-serif text-2xl text-[#412f3b] mb-1">Mes avis</h2>
                  {!canUseReviews ? (
                    <p className="text-sm text-[#70656a]">Les avis clientes ouvriront bientôt.</p>
                  ) : (
                    <>
                      {!reviewsCfg.enabled && isAdmin && (
                        <div className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-xs leading-5 mb-4">
                          Interrupteur « Avis clientes » sur OFF : cette rubrique n&apos;est visible que par l&apos;administration, pour les tests.
                        </div>
                      )}
                      {reviewToast && <div className="rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm mb-4">{reviewToast}</div>}
                      {reviewError && <div role="alert" className="rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm mb-4">{reviewError}</div>}

                      <h3 className="font-serif text-lg text-[#412f3b] mb-2 mt-2">Bijoux à évaluer</h3>
                      {reviewsLoading && reviewItems.length === 0 ? (
                        <p className="text-sm text-[#8b737e]">Chargement…</p>
                      ) : reviewItems.length === 0 ? (
                        <p className="text-sm text-[#70656a]">Aucun bijou livré pour l&apos;instant. Vous pourrez donner votre avis pendant {REVIEWS_RULES.windowDays} jours après la livraison.</p>
                      ) : (
                        <div className="space-y-2">
                          {reviewItems.map((it) => {
                            const st = it.review_status ? REVIEW_STATUS[it.review_status] : null;
                            const isOpen = reviewForm && reviewForm.order_id === it.order_id && reviewForm.product_id === it.product_id;
                            return (
                              <div key={`${it.order_id}-${it.product_id}`} className="rounded-2xl border border-[#eee2e5] p-3">
                                <div className="flex justify-between gap-2 items-start">
                                  <div className="min-w-0">
                                    <div className="font-serif text-base leading-tight truncate">{it.product_name}</div>
                                    <div className="text-[11px] text-[#8b737e] mt-1">
                                      Commande n° {it.order_id} · livrée le {formatDate(it.delivered_at)}
                                      {it.can_review && ` · encore ${daysLeft(it.deadline)} jour${daysLeft(it.deadline) > 1 ? "s" : ""}`}
                                    </div>
                                  </div>
                                  {it.can_review && !isOpen ? (
                                    <button type="button" onClick={() => openReviewForm(it)} className="shrink-0 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs">
                                      Donner mon avis
                                    </button>
                                  ) : !it.can_review && st && (it.review_status === "pending" || it.review_status === "published") ? (
                                    <span className={`shrink-0 text-[10px] rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                                  ) : !it.can_review ? (
                                    <span className="shrink-0 text-[10px] text-[#8b737e]">Délai dépassé</span>
                                  ) : null}
                                </div>
                                {isOpen && (
                                  <div className="mt-3 pt-3 border-t border-[#eee2e5]">
                                    <div className="flex gap-1" role="radiogroup" aria-label="Votre note">
                                      {[1, 2, 3, 4, 5].map((i) => (
                                        <button key={i} type="button" role="radio" aria-checked={reviewRating === i} aria-label={`${i} étoile${i > 1 ? "s" : ""}`} onClick={() => setReviewRating(i)} className="p-0.5">
                                          <Star size={26} className={i <= reviewRating ? "fill-[#b48a5a] text-[#b48a5a]" : "text-[#e2d6da]"} />
                                        </button>
                                      ))}
                                    </div>
                                    <div className="text-[11px] text-[#8b737e] mt-1">{reviewRating ? `${reviewRating}/5 · ${REVIEW_LABELS[reviewRating]}` : "Choisissez une note (obligatoire)"}</div>
                                    {!starsOnly && (
                                      <div className="mt-3">
                                        <label htmlFor="review-comment" className="text-xs text-[#54434c]">Votre commentaire (facultatif)</label>
                                        <textarea
                                          id="review-comment"
                                          rows={4}
                                          maxLength={maxChars}
                                          value={reviewComment}
                                          onChange={(e) => setReviewComment(e.target.value)}
                                          placeholder="Qu'avez-vous pensé de votre bague ? Évitez les données personnelles (téléphone, adresse…)."
                                          className="mt-1 w-full rounded-xl border border-[#eadfe4] focus:border-[#8f6075] px-3 py-2 text-sm leading-6 outline-none bg-white"
                                        />
                                        <div className="text-right text-[11px] text-[#8b737e]">{reviewComment.length.toLocaleString("fr-FR")} / {maxChars.toLocaleString("fr-FR")}</div>
                                      </div>
                                    )}
                                    <p className="text-[11px] text-[#8b737e] leading-4 mt-2">
                                      Votre avis sera publié avec votre prénom et l&apos;initiale de votre nom, après relecture sous {REVIEWS_RULES.moderationDays} jours ouvrés maximum. Il reste en ligne {REVIEWS_RULES.publicationYears} ans ; vous pouvez le retirer à tout moment.{" "}
                                      {reviewsCfg.enabled && <a href="/charte-des-avis" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">Charte des avis</a>}
                                    </p>
                                    <div className="flex gap-2 mt-3">
                                      <button type="button" onClick={sendReview} disabled={reviewSending || reviewRating < 1} className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-9 text-sm disabled:opacity-50">
                                        {reviewSending ? "Envoi…" : "Envoyer mon avis"}
                                      </button>
                                      <button type="button" onClick={() => setReviewForm(null)} className="rounded-full border border-[#d9c5cc] px-4 h-9 text-sm hover:bg-[#f5edf1]">Annuler</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <h3 className="font-serif text-lg text-[#412f3b] mb-2 mt-6">Mes avis</h3>
                      {myReviews.length === 0 ? (
                        <p className="text-sm text-[#70656a]">Vous n&apos;avez pas encore déposé d&apos;avis.</p>
                      ) : (
                        <div className="space-y-2">
                          {myReviews.map((r) => {
                            const st = REVIEW_STATUS[r.status] || REVIEW_STATUS.pending;
                            return (
                              <div key={r.id} className="rounded-2xl border border-[#eee2e5] p-3">
                                <div className="flex justify-between gap-2 items-start">
                                  <div className="min-w-0">
                                    <div className="font-serif text-base leading-tight truncate">{reviewProductName(r)}</div>
                                    <div className="mt-1"><Stars value={r.rating} /></div>
                                  </div>
                                  <div className="shrink-0 flex flex-col items-end gap-1">
                                    <span className={`text-[10px] rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                                    {r.is_test && <span className="text-[10px] rounded-full px-2 py-0.5 bg-[#eef0f6] text-[#4a5578]">Test · jamais publié</span>}
                                  </div>
                                </div>
                                {r.comment && <p className="text-sm text-[#54434c] leading-6 mt-2 whitespace-pre-line break-words">{r.comment}</p>}
                                <div className="text-[11px] text-[#8b737e] mt-1">
                                  {r.status === "published" && r.published_at ? `Publié le ${formatDate(r.published_at)}` : `Envoyé le ${formatDate(r.created_at)}`}
                                </div>
                                {r.status === "refused" && (
                                  <div className="text-[11px] text-red-700 mt-1 leading-4">
                                    Motif : {REFUSAL_REASONS[r.refusal_reason] || "non précisé"}. Vous pouvez déposer un nouvel avis tant que le délai de {REVIEWS_RULES.windowDays} jours court.
                                  </div>
                                )}
                                {r.reply && r.status === "published" && (
                                  <div className="mt-2 rounded-xl bg-[#f8f2f4] px-3 py-2">
                                    <div className="text-[11px] text-[#8f6075]">💬 Réponse de Zenoria</div>
                                    <p className="text-sm text-[#54434c] leading-6 whitespace-pre-line break-words">{r.reply}</p>
                                  </div>
                                )}
                                {(r.status === "pending" || r.status === "published") && (
                                  <div className="mt-2">
                                    {withdrawConfirmId === r.id ? (
                                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                        <span className="text-[#54434c]">Retirer définitivement cet avis ?</span>
                                        <button type="button" onClick={() => withdrawReview(r.id)} className="rounded-full border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50">Oui, retirer</button>
                                        <button type="button" onClick={() => setWithdrawConfirmId(null)} className="underline text-[#8b737e]">Annuler</button>
                                      </div>
                                    ) : (
                                      <button type="button" onClick={() => setWithdrawConfirmId(r.id)} className="text-[11px] underline text-[#8f6075]">Retirer mon avis</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {current && current.id === "favoris" && (
                <div data-testid="section-favoris">
                  <div className="flex justify-between items-center mb-1">
                    <h2 className="font-serif text-2xl text-[#412f3b]">Mes favoris</h2>
                    <a href="/" className="text-xs text-[#8f6075] underline">Voir toutes les créations</a>
                  </div>
                  {favMsg && <div className="rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm my-3">{favMsg}</div>}
                  {favLoading && favProducts.length === 0 ? (
                    <p className="text-sm text-[#8b737e] mt-3">Chargement…</p>
                  ) : favProducts.length === 0 ? (
                    <div className="text-center py-8">
                      <Heart className="mx-auto text-[#b88d9f] mb-3" size={36} />
                      <p className="font-serif text-xl text-[#412f3b] mb-1">Aucun favori pour l&apos;instant</p>
                      <p className="text-sm text-[#8b737e] mb-4">Touchez le cœur d&apos;une création pour la retrouver ici.</p>
                      <a href="/" className="inline-block rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 leading-10 text-sm">Découvrir les créations</a>
                    </div>
                  ) : (
                    <div className="space-y-2 mt-3">
                      {favProducts.map((p) => (
                        <div key={p.id} className="flex gap-3 rounded-2xl border border-[#eee2e5] p-3">
                          <FavThumb product={p} />
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              {p.active && p.slug ? (
                                <a href={`/#bague=${encodeURIComponent(p.slug)}`} target="_blank" rel="noopener noreferrer" className="font-serif text-base leading-tight truncate hover:underline block">{p.name}</a>
                              ) : (
                                <div className="font-serif text-base leading-tight truncate">{p.name}</div>
                              )}
                              <div className="text-sm text-[#412f3b] mt-1">{formatEUR(effectivePrice(p))}</div>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button type="button" onClick={() => removeFromFavorites(p.id)} className="rounded-full border border-[#d9c5cc] px-3 py-1 text-xs hover:bg-[#f5edf1]">Retirer des favoris</button>
                                                            {!p.active ? (
                                <button type="button" disabled className="rounded-full bg-[#8f6075] text-white px-3 py-1 text-xs opacity-50">Plus en vente</button>
                              ) : getAvailability(p).orderable ? (
                                <button type="button" onClick={() => addFavoriteToCart(p)} className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs">Ajouter au panier</button>
                              ) : (
                                <CatalogWriteUs product={p} contactSettings={contactCfg} compact /> /* ZENORIA_FAV_STOCK_V1 : épuisé, en cours de commande ou vendue */
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {current && current.id === "donnees" && (
                <AccountDataSection user={user} />
              )}

              {current && current.id === "profil" && (
                <AccountProfileSection user={user} />
              )}

              {current && !["accueil", "commandes", "avis", "favoris", "donnees", "profil"].includes(current.id) && (
                <>
                  <h2 className="font-serif text-2xl text-[#412f3b]">{current.label}</h2>
                  <p className="text-sm text-[#8b737e] mt-2">
                    Cette rubrique sera bientôt disponible.
                    {isAdmin && <span className="block text-[11px] mt-1">(Admin : contenu prévu à l&apos;étape {current.step} de la feuille de route.)</span>}
                  </p>
                </>
              )}

              {logoutAsk && (
                <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="logout-cart-title" data-testid="logout-cart-dialog">
                  <div className="w-full max-w-sm rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">
                    <h3 id="logout-cart-title" className="font-serif text-xl text-[#412f3b]">Voulez-vous garder votre panier ?</h3>
                    <p className="mt-2 text-sm text-[#54434c]">Vous avez {logoutCartCount} article{logoutCartCount > 1 ? "s" : ""} dans votre panier.</p>
                    <button type="button" onClick={() => finishLogout("keep")} data-testid="logout-keep" className="mt-5 w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white h-11 text-sm font-medium transition">Oui, garder mes articles</button>
                    <button type="button" onClick={() => finishLogout("clear")} data-testid="logout-clear" className="mt-2 w-full rounded-full border border-[#82576c] text-[#82576c] hover:bg-[#f5edf1] h-11 text-sm font-medium transition">Non, vider le panier</button>
                    <button type="button" onClick={() => setLogoutAsk(false)} data-testid="logout-cancel" className="mt-3 block mx-auto text-sm text-[#8f6075] underline">Rester connectée</button>
                  </div>
                </div>
              )}
              <button type="button" onClick={logout} className="lg:hidden mt-8 inline-flex items-center gap-2 text-sm text-[#8b737e] underline">
                <LogOut size={15} /> Se déconnecter
              </button>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
