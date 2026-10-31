
import React, { useMemo, useState, useEffect, useRef } from "react";
import Head from "next/head";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, Search, User, Heart, Menu, X, Sparkles, ArrowRight,
  Gem, Instagram, LogOut, Minus, Plus, Trash2, Tag, Truck, Settings, Mail, MessageCircle, Send, BookOpen, Hand
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase, getMediaUrl } from "@/lib/supabase";
import { CONTACT_KEY, DEFAULT_CONTACT, parseContactSetting, buildMailtoLink, buildWhatsAppLink, buildSignalLink } from "@/lib/contactSettings";
import { useSiteStatus } from "@/lib/siteStatus";
import { formatReturnAt } from "@/lib/maintenance";
import AuthModal from "@/components/AuthModal";
import PaymentConfirmationModal from "@/components/PaymentConfirmationModal";
import MediaGuard from "@/components/MediaGuard";
import SavoirFaire from "@/components/SavoirFaire";
import BannerBar from "@/components/BannerBar";
import SeasonFx from "@/components/SeasonFx";
import SeasonIcon from "@/components/SeasonIcon";
import Mannequin from "@/components/Mannequin";
import { RingVisual, AvailabilityBadge, PriceTag } from "@/components/ProductParts";
import ProductSheet from "@/components/ProductSheet";
import FavoriteButton from "@/components/FavoriteButton";
import CrystalLogo from "@/components/CrystalLogo";
import Footer from "@/components/Footer";
import {
  readLocalFavorites,
  toggleLocalFavorite,
  fetchFavoriteIds,
  addFavorite,
  removeFavorite,
  mergeLocalFavoritesIntoAccount,
} from "@/lib/favorites";
import { formatPrice, getAvailability } from "@/lib/shopUtils";
import { parseCartReturnHash, encodeResultHash } from "@/lib/quizState";
import {
  visibleFamilies, buildSeasonCards, buildFamilyChips, filterByFamily, productLabel, familyOfProduct,
  parseFxSetting, resolveFxSeason,
} from "@/lib/seasons";
import { pickPublicBanner, bannerKey, readClosedKeys, writeClosedKeys, getSessionStorage } from "@/lib/publicBanner";
import { SITE_SETTINGS_TABLE, SEASON_FX_KEY, parseSeasonFxSetting, pickFxSeason } from "@/lib/siteSettings";
import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting, shippingStripText } from "@/lib/shippingSettings";
import { round2, effectivePrice, computeTotals } from "@/lib/cartTotals"; // ZENORIA_SHIPPING_RULE_V1 : calcul du panier = source unique
import { PAYMENT_METHODS_KEY, DEFAULT_PAYMENT_METHODS, parsePaymentMethods } from "@/lib/paymentSettings";
import { SITE_TEXTS_KEY, DEFAULT_TEXTS, resolveSiteTexts } from "@/lib/siteTexts";
// ZENORIA_STORY_REVIEWS_V1
import { REVIEWS_KEY, DEFAULT_REVIEWS, parseReviewsSetting } from "@/lib/reviewsSettings";
import StorySection, { OPEN_STORY_EVENT } from "@/components/StorySection";
// ZENORIA_ACCOUNT_STEP14_V1 : import MyReviewsPanel retiré (contenu repris dans /compte#avis)
// ZENORIA_REVIEWS_STEP3_V1 : affichage des avis (fiche bague + section) et aperçu admin
import { ReviewRatingLine, ProductReviewsList, ReviewsSection, openReviewsSection } from "@/components/Reviews";
import { Star as StarIcon } from "lucide-react";
import TextLines from "@/components/TextLines";
// ============================================================
// RÉGLAGES DE LA BOUTIQUE (à adapter facilement)
// ============================================================
// ZENORIA_SHIPPING_RULE_V1 : les frais de livraison, les arrondis, le prix effectif et le calcul du panier viennent de lib/cartTotals.js
// Le seuil de livraison offerte et son interrupteur se règlent dans l'admin (Contenu du site) : voir lib/shippingSettings.js
const MAX_QTY_PER_PRODUCT = 10;         // quantité max par bague (stock + fabrication sur commande)
// Le délai de fabrication une fois le stock épuisé (BACKORDER_LEAD_TIME) se règle dans lib/shopUtils.js
const CART_STORAGE_KEY = "zenoria_cart_v2";
// ============================================================
// Le catalogue (collections) et les codes promo ne sont plus codés
// en dur ici : ils sont lus depuis la base de données Supabase, et
// peuvent être modifiés depuis l'interface d'administration (/admin)
// sans avoir à toucher au code ni à redéployer le site.
// Les photos/vidéos sont résolues via getMediaUrl() : compatible à
// la fois avec les fichiers uploadés depuis /admin (Supabase Storage)
// et les anciennes collections dont les médias sont dans /public/images.
// ============================================================
// Requête dont l'échec ne doit jamais empêcher le site de s'afficher (table pas encore créée, réseau coupé...).
const optionalQuery = (query) => Promise.resolve(query).then((res) => res, () => ({ data: null, error: true }));
// (round2 et effectivePrice : voir lib/cartTotals.js)
// Convertit une ligne de la table "products" (Supabase) vers le format utilisé par l'interface.
function mapDbProduct(row) {
  const photos = Array.isArray(row.photos) ? row.photos : [];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    family: row.family, // ancien texte (« Collection Bleus »), gardé en secours si les familles ne peuvent pas être lues
    familyId: row.family_id ?? null,
    neighbourFamilyId: row.neighbour_family_id ?? null,
    dominantColors: Array.isArray(row.dominant_colors) ? row.dominant_colors : [],
    collection: row.collection,
    energy: row.energy,
    price: Number(row.price),
    promoPrice: row.promo_price !== null && row.promo_price !== undefined ? Number(row.promo_price) : null,
    stock: typeof row.stock === "number" ? row.stock : 0,
    isUnique: row.is_unique === true,
    pitch: row.pitch || "",
    photos,
    video: row.video || null,
    color: row.color || "from-rose-300 via-pink-100 to-white",
    stone: row.stone || "💎",
    photoCount: photos.length,
    videoCount: row.video ? 1 : 0,
  };
}
// Calcul des montants du panier : computeTotals vient de lib/cartTotals.js (règle unique de la livraison offerte).
// ============================================================
// AFFICHAGE ADAPTATIF DU PANIER
// ============================================================
const CART_DENSITY = {
  comfort: { thumb: "h-20 w-20", name: "text-lg", btn: "h-8 w-8", rowH: 150 },
  compact: { thumb: "h-14 w-14", name: "text-base", btn: "h-7 w-7", rowH: 112 },
  dense: { thumb: "h-12 w-12", name: "text-sm", btn: "h-6 w-6", rowH: 90 },
};
const CART_RESERVED_HEIGHT = 380;
function pickCartDensity(lineCount, viewportHeight, extraHeight = 0) {
  const available = Math.max(0, viewportHeight - CART_RESERVED_HEIGHT - extraHeight);
  return ["comfort", "compact"].find((d) => lineCount * CART_DENSITY[d].rowH <= available) || "dense";
}
// Les familles (les 4 saisons et les familles supplémentaires) sont lues dans la base de données (table « families »,
// onglet Familles de /admin). Leur mise en forme est dans lib/seasons.js.
// Vidéo d'accueil dédiée (onglet « Contenu du site » de /admin) : en boucle, sans le son, dans le cercle de la bannière.
// Si le fichier ne se charge pas, on revient à la vidéo de la première collection.
function HeroVideo({ path, fallback }) {
  const [failed, setFailed] = useState(false);
  const src = getMediaUrl(path, "site");
  if (failed || !src) {
    return fallback ? <RingVisual product={fallback} large circle video /> : null;
  }
  return (
    <div className="relative w-full h-full rounded-full overflow-hidden bg-black">
      <video
        key={src}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        onError={() => setFailed(true)}
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
}
// Petite vignette à taille variable, utilisée dans le panier
function CartThumb({ product, size = "h-20 w-20" }) {
  const [imgError, setImgError] = useState(false);
  const src = product.photos && product.photos[0] ? getMediaUrl(product.photos[0], product.slug) : null;
  if (src && !imgError) {
    return (
      <div className={`${size} shrink-0 rounded-xl overflow-hidden bg-[#f5edf1]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={product.name} onError={() => setImgError(true)} className="w-full h-full object-cover object-center" />
      </div>
    );
  }
  return (
    <div className={`${size} shrink-0 rounded-xl bg-gradient-to-br ${product.color} grid place-items-center text-xl`}>
      {product.stone}
    </div>
  );
}
// Pastille de la famille (saison) d'une bague, posée sur sa photo dans le catalogue
function FamilyPill({ product, families }) {
  const family = familyOfProduct(product, families);
  if (!family) return null;
  return (
    <span data-testid="family-pill" className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/85 backdrop-blur px-3 py-1 text-xs">
      <i className="h-2 w-2 rounded-full" style={{ background: family.accent || "#8f6075" }} />
      {family.name}
    </span>
  );
}
// ZENORIA_PIECE_UNIQUE_STEP4_V1 : encart "pièce unique" affiché sur la fiche produit ouverte.
// Réutilise contactSettings déjà chargé par la page (aucune nouvelle donnée à lire).
function UniqueNotice({ product, contactSettings }) {
  if (!product || product.isUnique !== true) return null;
  const hasEmail = Boolean(contactSettings.email.enabled && contactSettings.email.value.trim());
  const hasWhatsapp = Boolean(contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim());
  const subject = `À propos de « ${product.name} »`;
  const emailBody = `Bonjour,\n\nLe modèle « ${product.name} » m'a touchée, et j'aimerais en savoir plus sur une création qui s'en inspire.\n`;
  const waText = `Bonjour, le modèle « ${product.name} » m'a touchée, j'aimerais en savoir plus sur une création qui s'en inspire.`;
  const contactHref = hasEmail
    ? buildMailtoLink(contactSettings.email.value.trim(), subject, emailBody)
    : hasWhatsapp
    ? buildWhatsAppLink(contactSettings.whatsapp.value.trim(), waText)
    : null;
  return (
    <p className="text-sm leading-6 text-[#54434c] mt-4 rounded-xl bg-[#f5edf1] px-4 py-3">
      <span className="font-medium">✦ Pièce unique</span> — Façonnée une seule fois, elle ne sera jamais reproduite à l'identique.{" "}
      {contactHref ? (
        <>
          Elle vous touche ?{" "}
          <a href={contactHref} target={hasEmail ? undefined : "_blank"} rel="noopener noreferrer" className="underline text-[#8f6075]">Écrivez-nous</a>
          {" "}: nous pouvons imaginer une création qui s'en inspire.
        </>
      ) : (
        "Contactez-nous pour en savoir plus sur une création qui s'en inspire."
      )}
    </p>
  );
}

export default function ZenoriaShop() {
  // --- Catalogue et codes promo, chargés depuis Supabase ---
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [promoCodes, setPromoCodes] = useState({});
  // Médias dédiés gérés depuis /admin (onglet « Contenu du site ») : { hero_video, savoir_faire_photo }
  const [siteMedia, setSiteMedia] = useState({});
  // --- État de la maintenance (onglet « Maintenance » de /admin) ---
  // « shop_pause » : le catalogue reste visible, la commande est fermée.
  // « full » : visible ici seulement pour un administrateur qui prévisualise le site pendant la coupure.
  const siteStatus = useSiteStatus();
  const shopPaused = siteStatus.mode === "shop_pause";
  const previewingMaintenance = siteStatus.mode === "full";
  const pauseReturn = siteStatus.returnAt ? formatReturnAt(siteStatus.returnAt) : "";
  // --- Panier ---
  const [cartItems, setCartItems] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentMethodsCfg, setPaymentMethodsCfg] = useState(DEFAULT_PAYMENT_METHODS);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  useEffect(() => {
    if (!paymentMethodsLoaded) return; // quand les deux modes sont proposes, la cliente choisit elle-meme
    if (paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled) setPaymentMethod("card");
    else if (!paymentMethodsCfg.stripe_enabled && paymentMethodsCfg.transfer_enabled) setPaymentMethod("transfer");
  }, [paymentMethodsLoaded, paymentMethodsCfg.stripe_enabled, paymentMethodsCfg.transfer_enabled]);
  const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);
  const [transferShipping, setTransferShipping] = useState({ fullName: "", line1: "", line2: "", postalCode: "", city: "", phone: "" });
  const [transferResult, setTransferResult] = useState(null); // { orderId, total, dueAt } apres une commande par virement
  const [cartStep, setCartStep] = useState("cart"); // "cart" | "shipping" (virement : ecran Livraison dedie)
  const [logoutAsk, setLogoutAsk] = useState(false); // fenetre "garder le panier ?" a la deconnexion
  const [logoutNotice, setLogoutNotice] = useState(""); // message affiche apres la deconnexion
  const [transferDelayDays, setTransferDelayDays] = useState(null); // duree de reservation (jours), lue en base
  const [viewportH, setViewportH] = useState(800);
  // Favoris : identifiants des bagues aimées. En mode invité, stockés dans le navigateur (lib/favorites.js) ;
  // une fois connectée, stockés dans Supabase (table customer_favorites), avec fusion additive à la connexion.
  const [favIds, setFavIds] = useState([]);
  const [favPanelOpen, setFavPanelOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  // ZENORIA_ACCOUNT_STEP13_V1 : retour depuis /compte (« Commander à nouveau ») -> ouvre le panier
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("panier") === "compte") {
      setCartOpen(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, []);
  const [quizReturn, setQuizReturn] = useState(""); // adresse « /quiz#r=… » quand la visiteuse vient du quiz et veut y revenir
  const [selected, setSelected] = useState(null);
  const [selectedMode, setSelectedMode] = useState("video");
  const logo = 1;
  // Familles (saisons), bandeau et animation, lus dans la base de données
  const [selectedFamily, setSelectedFamily] = useState(null); // identifiant technique de la famille choisie (par exemple « automne »)
  const [families, setFamilies] = useState([]);
  const [bannerRows, setBannerRows] = useState([]);
  const [closedBanners, setClosedBanners] = useState([]);
  const [fxSetting, setFxSetting] = useState(() => parseSeasonFxSetting(null)); // réglage de l'animation (onglet « Contenu du site » de /admin) : automatique tant qu'il n'est pas lu
  const [shippingCfg, setShippingCfg] = useState(DEFAULT_SHIPPING); // livraison offerte : montant et interrupteur (onglet « Contenu du site » de /admin), par défaut tant qu'ils ne sont pas lus
  const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS); // avis clientes + charte (admin : Contenu du site)
  const [contactSettings, setContactSettings] = useState(DEFAULT_CONTACT); // canaux de contact (e-mail, WhatsApp, Signal), onglet « Contenu du site » de /admin
  const [siteTexts, setSiteTexts] = useState(DEFAULT_TEXTS); // textes du Savoir-faire et de l'accueil (onglet « Contenu du site » de /admin) : textes d'origine tant qu'ils ne sont pas lus
  const [fxClicked, setFxClicked] = useState(null); // saison choisie par un clic : elle donne son ambiance à la page
  const [nowMs, setNowMs] = useState(null); // renseigné après l'affichage : le rendu du serveur ne dépend jamais de l'heure
  // --- Authentification (Supabase) ---
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState("login");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  // ZENORIA_ACCOUNT_STEP14_V1 : état reviewsPanelOpen retiré (plus de panneau latéral pour les avis)
  // ZENORIA_ACCOUNT_STEP11_V1 : arrivée depuis /compte sans session -> fenêtre de connexion ouverte
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connexion") === "compte") {
      setAuthModalMode("login");
      setAuthModalOpen(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, []);
  // ZENORIA_ACCOUNT_STEP11_V1 : connexion réussie après une demande venant de /compte -> retour à l'espace cliente (10 min max)
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem("zenoria_return_to");
      if (!raw) return;
      window.sessionStorage.removeItem("zenoria_return_to");
      const r = JSON.parse(raw);
      if (r && typeof r.to === "string" && r.to.startsWith("/compte") && Date.now() - r.at < 600000) window.location.href = r.to;
    } catch (e) {
      // valeur illisible : on reste sur l'accueil
    }
  }, [user]);
  const [isAdmin, setIsAdmin] = useState(false);
  // Charge le catalogue + les codes promo, puis restaure le panier sauvegardé
  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: prodData, error: prodErr }, { data: promoData }, { data: siteData }, famRes, banRes, fxRes] = await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("id"),
        supabase.from("promo_codes").select("*").eq("active", true),
        supabase.from("site_media").select("*"),
        optionalQuery(supabase.from("families").select("*").order("sort_order", { ascending: true })),
        optionalQuery(supabase.from("banners").select("*")),
        optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select("key, value").in("key", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY, PAYMENT_METHODS_KEY])),
      ]);
      if (!active) return;
      const loadedProducts = !prodErr && prodData ? prodData.map(mapDbProduct) : [];
      setProducts(loadedProducts);
      const promoMap = {};
      (promoData || []).forEach((p) => {
        promoMap[p.code] = { type: p.type, value: Number(p.value), label: p.label };
      });
      setPromoCodes(promoMap);
      // Si la table n'existe pas encore (script SQL non exécuté), siteData est vide : le site garde son comportement d'origine
      const siteMap = {};
      (siteData || []).forEach((r) => {
        siteMap[r.slot] = r;
      });
      setSiteMedia(siteMap);
      // Familles et bandeaux : si une table n'existe pas encore, le site garde son comportement d'origine
      setFamilies(visibleFamilies(famRes && famRes.data));
      setBannerRows((banRes && Array.isArray(banRes.data) && banRes.data) || []);
      // Animation : si la table n'existe pas encore (script SQL non exécuté), le site reste en mode automatique
      const settingRows = fxRes && Array.isArray(fxRes.data) ? fxRes.data : [];
      const fxRow = settingRows.find((r) => r.key === SEASON_FX_KEY) || null;
      const shipRow = settingRows.find((r) => r.key === SHIPPING_KEY) || null;
      const paymentRow = settingRows.find((r) => r.key === PAYMENT_METHODS_KEY) || null;
      setPaymentMethodsCfg(parsePaymentMethods(paymentRow ? paymentRow.value : null));
      setPaymentMethodsLoaded(true);
      const textRow = settingRows.find((r) => r.key === SITE_TEXTS_KEY) || null;
      setFxSetting(parseSeasonFxSetting(fxRow ? fxRow.value : null));
      // Livraison offerte : si la ligne n'existe pas encore (script SQL non exécuté), le site garde la valeur par défaut
      setShippingCfg(parseShippingSetting(shipRow ? shipRow.value : null));
      // Canaux de contact : si la ligne n'existe pas encore, le site garde la valeur par défaut (e-mail seul)
      const contactRow = settingRows.find((r) => r.key === CONTACT_KEY) || null;
      // Avis clientes : ligne absente ou illisible -> désactivé (lien de la charte masqué)
      const reviewsRow = settingRows.find((r) => r.key === REVIEWS_KEY) || null;
      setReviewsCfg(parseReviewsSetting(reviewsRow ? reviewsRow.value : null));
      setContactSettings(parseContactSetting(contactRow ? contactRow.value : null));
      // Textes : si la ligne n'existe pas encore, le site garde ses textes d'origine
      setSiteTexts(resolveSiteTexts(textRow ? textRow.value : null));
      try {
        const raw = window.localStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          const items = (saved.items || [])
            .map((i) => {
              const p = loadedProducts.find((x) => x.id === i.id);
              return p ? { id: p.id, qty: Math.min(MAX_QTY_PER_PRODUCT, Math.max(1, Number(i.qty) || 1)) } : null;
            })
            .filter(Boolean);
          setCartItems(items);
          if (saved.promo && promoMap[saved.promo]) setPromoCode(saved.promo);
        }
      } catch (e) {
        // panier illisible : on repart d'un panier vide
      }
      setCatalogLoading(false);
      setCartLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);
  // Favoris : tant que la connexion n'est pas encore connue, on affiche déjà ceux du navigateur (mode invité).
  useEffect(() => {
    setFavIds(readLocalFavorites());
  }, []);
  // Heure du navigateur, rafraîchie chaque minute : un bandeau échu disparaît et le compte à rebours avance sans recharger la page.
  useEffect(() => {
    setNowMs(Date.now());
    setClosedBanners(readClosedKeys(getSessionStorage()));
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const checkAdmin = async (currentUser) => {
      if (!currentUser) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      setIsAdmin(Boolean(data));
    };
    supabase.auth.getSession().then(({ data }) => {
      const currentUser = data.session ? data.session.user : null;
      setUser(currentUser);
      checkAdmin(currentUser);
      // Cliente déjà connectée au chargement de la page : ses favoris enregistrés remplacent ceux du navigateur.
      if (currentUser) {
        fetchFavoriteIds(currentUser.id).then(setFavIds);
      }
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session ? session.user : null;
      setUser(currentUser);
      if (_event === "PASSWORD_RECOVERY") {
        setAuthModalMode("update");
        setAuthModalOpen(true);
      }
      // Connexion réussie : fusionne les favoris du navigateur (mode invité) avec ceux déjà enregistrés pour cette cliente.
      if (_event === "SIGNED_IN" && currentUser) {
        mergeLocalFavoritesIntoAccount(currentUser.id).then(setFavIds);
      }
      // Déconnexion : on revient aux favoris du navigateur (mode invité).
      if (_event === "SIGNED_OUT") {
        setFavIds(readLocalFavorites());
      }
      checkAdmin(currentUser);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);
  // Nettoie l'URL après une connexion automatique via lien d'e-mail
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      const timer = setTimeout(() => {
        window.history.replaceState(null, "", window.location.pathname);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);
  // Détecte le retour réussi d'un paiement Stripe (paramètre ?paiement=succes),
  // vide le panier, affiche la confirmation, puis nettoie l'adresse.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paiement") === "succes") {
      clearCart();
      setPaymentConfirmationOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  // Enregistre le panier à chaque modification
  useEffect(() => {
    if (!cartLoaded) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: cartItems, promo: promoCode }));
    } catch (e) {
      // stockage indisponible : on ignore
    }
  }, [cartItems, promoCode, cartLoaded]);
  // Fermeture des fenêtres avec la touche Échap
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setLogoutAsk(false);
        setCartOpen(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Suit la hauteur de la fenêtre pour adapter le panier
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  // Deconnexion : avec des articles dans le panier, une fenetre demande s ils sont gardes.
  // Une session expiree ne passe pas par ici : rien n est efface dans ce cas.
  const resetCartPersonalState = () => {
    setTransferShipping({ fullName: "", line1: "", line2: "", postalCode: "", city: "", phone: "" });
    setCgvAccepted(false);
    setCheckoutError("");
    setCartStep("cart");
    setCartNotice("");
    setPromoCode("");
    setPromoInput("");
    setPromoError("");
    setPromoOpen(false);
    setPaymentMethod((paymentMethodsCfg.stripe_enabled && paymentMethodsCfg.transfer_enabled) ? null : (paymentMethodsCfg.stripe_enabled ? "card" : "transfer"));
  };
  const finishLogout = async (mode) => {
    setLogoutAsk(false);
    setAccountMenuOpen(false);
    setMenu(false);
    resetCartPersonalState();
    if (mode === "clear") setCartItems([]);
    await supabase.auth.signOut();
    if (mode === "keep") setLogoutNotice("Vous êtes déconnectée. Votre panier est conservé sur cet appareil.");
    else if (mode === "clear") setLogoutNotice("Vous êtes déconnectée. Votre panier a été vidé.");
    else setLogoutNotice("Vous êtes déconnectée.");
  };
  const handleLogout = async () => {
    setAccountMenuOpen(false);
    if (cartItems.length > 0) {
      setLogoutAsk(true);
      return;
    }
    await finishLogout("empty");
  };
  // Active/désactive un favori : écrit dans Supabase si connectée, sinon dans le navigateur (mode invité).
  const toggleFavorite = (productId) => {
    if (user) {
      const isFav = favIds.includes(productId);
      setFavIds(isFav ? favIds.filter((id) => id !== productId) : [...favIds, productId]);
      if (isFav) removeFavorite(user.id, productId);
      else addFavorite(user.id, productId);
    } else {
      setFavIds(toggleLocalFavorite(productId));
    }
  };
  // --- Calculs du panier ---
  const cartLines = useMemo(
    () =>
      cartItems
        .map((it) => ({ product: products.find((p) => p.id === it.id), qty: it.qty }))
        .filter((l) => l.product),
    [cartItems, products]
  );
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const transferStep = paymentMethod === "transfer" && Boolean(user) && cartStep === "shipping";
  const recapStep = paymentMethod === "transfer" && Boolean(user) && cartStep === "recap";
  const showShipHeader = !transferStep && !recapStep && cartLines.length > 0 && shippingCfg.enabled; // livraison offerte dans l'en-tete
  useEffect(() => {
    if (!cartOpen || paymentMethod !== "transfer" || !user || cartLines.length === 0) setCartStep("cart");
  }, [cartOpen, paymentMethod, user, cartLines.length]);
  useEffect(() => {
    if (!cartOpen) setCheckoutError(""); // un message d erreur ne survit pas a la fermeture du panier
  }, [cartOpen]);
  useEffect(() => {
    if (!logoutNotice) return undefined;
    const t = setTimeout(() => setLogoutNotice(""), 5000);
    return () => clearTimeout(t);
  }, [logoutNotice]);
  useEffect(() => {
    if (!recapStep || transferDelayDays !== null) return undefined;
    let alive = true;
    fetch("/api/transfer-terms")
      .then((r) => r.json())
      .then((d) => { if (alive && d && d.ok && Number.isInteger(d.delayDays)) setTransferDelayDays(d.delayDays); })
      .catch(() => {});
    return () => { alive = false; };
  }, [recapStep, transferDelayDays]);
  const promo = promoCode ? promoCodes[promoCode] : null;
  const totals = useMemo(() => computeTotals(cartLines, promo, shippingCfg), [cartLines, promo, shippingCfg]);
  const progress = Math.min(100, Math.round((totals.subtotal / shippingCfg.threshold) * 100)); // ZENORIA_SHIPPING_RULE_V1 : montant du panier avant code promo
  const cartDensity = pickCartDensity(
    cartLines.length,
    viewportH,
    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0) + (quizReturn ? 56 : 0) + (!user ? 24 : 0) + 44 + (shippingCfg.enabled ? 92 : 0)
  );
  const tightFooter = cartDensity === "dense";
  const dens = CART_DENSITY[cartDensity];
  // --- Familles (saisons) : cartes, filtres et libellés, avec le nombre de créations du catalogue ---
  const seasonCards = useMemo(() => buildSeasonCards(families, products), [families, products]);
  const familyChips = useMemo(() => buildFamilyChips(families, products), [families, products]);
  const familiesReady = seasonCards.length > 0; // sinon (table illisible) : le catalogue s'affiche sans les saisons
  // --- Favoris : bagues correspondant aux identifiants favoris, nettoyées si un produit n'existe plus ---
  const favoriteLines = useMemo(() => products.filter((p) => favIds.includes(p.id)), [products, favIds]);
  // --- Bandeau : le plus prioritaire, jamais pendant une pause ou une maintenance, jamais avec un code devenu invalide ---
  const validCodes = useMemo(() => new Set(Object.keys(promoCodes)), [promoCodes]);
  const currentBanner =
    nowMs === null || catalogLoading
      ? null
      : pickPublicBanner(bannerRows, nowMs, {
          paused: shopPaused || previewingMaintenance,
          closedKeys: closedBanners,
          validCodes,
          checkStart: isAdmin, // un administrateur reçoit aussi les bandeaux programmés : on vérifie leur début
        });
  // --- Actions du panier ---
  const addToCart = (p) => {
    const current = cartItems.find((i) => i.id === p.id);
    setCheckoutNotice(false);
    if (current && current.qty >= MAX_QTY_PER_PRODUCT) {
      setCartNotice(`Quantité maximale atteinte pour « ${p.name} ».`);
      setCartOpen(true);
      return;
    }
    setCartNotice("");
    setCartItems(
      current
        ? cartItems.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...cartItems, { id: p.id, qty: 1 }]
    );
    setCartOpen(true);
  };
  const changeQty = (p, delta) => {
    const current = cartItems.find((i) => i.id === p.id);
    if (!current) return;
    setCheckoutNotice(false);
    if (delta > 0 && current.qty >= MAX_QTY_PER_PRODUCT) {
      setCartNotice(`Quantité maximale atteinte pour « ${p.name} ».`);
      return;
    }
    setCartNotice("");
    setCartItems(
      cartItems.map((i) => (i.id === p.id ? { ...i, qty: Math.min(MAX_QTY_PER_PRODUCT, Math.max(1, i.qty + delta)) } : i))
    );
  };
  const removeLine = (p) => {
    setCartNotice("");
    setCheckoutNotice(false);
    setCartItems(cartItems.filter((i) => i.id !== p.id));
  };
  const clearCart = () => {
    setCartNotice("");
    setCheckoutNotice(false);
    setCartItems([]);
    setPromoCode("");
    setPromoOpen(false);
  };
  // Ecran Livraison -> Recapitulatif : l'adresse doit etre complete avant de continuer.
  const goToTransferRecap = () => {
    const okAddress = transferShipping.fullName.trim() && transferShipping.line1.trim() && transferShipping.city.trim() && /^[0-9]{5}$/.test(transferShipping.postalCode.trim());
    if (!okAddress) {
      setCheckoutError("Merci de compléter votre adresse de livraison (code postal à 5 chiffres).");
      return;
    }
    setCheckoutError("");
    setCartStep("recap");
  };
  // Virement : la commande est creee cote serveur (/api/checkout-transfer), qui relit les prix en base.
  const submitTransferOrder = async () => {
    if (!user) {
      setCheckoutError("Un compte est nécessaire pour payer par virement. Connectez-vous ou créez votre compte.");
      return;
    }
    const name = transferShipping.fullName.trim();
    const line1 = transferShipping.line1.trim();
    const postalCode = transferShipping.postalCode.trim();
    const city = transferShipping.city.trim();
    if (!name || !line1 || !city || !/^[0-9]{5}$/.test(postalCode)) {
      setCheckoutError("Merci de compléter votre adresse de livraison (code postal à 5 chiffres).");
      return;
    }
    setCheckoutLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const token = sessionData && sessionData.session ? sessionData.session.access_token : null;
      if (sessionError || !token) throw new Error("Session indisponible");
      const res = await fetch("/api/checkout-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: cartItems.map((it) => ({ id: it.id, qty: it.qty })),
          promoCode: promoCode || null,
          shipping: { fullName: name, line1, line2: transferShipping.line2.trim() || null, postalCode, city, phone: transferShipping.phone.trim() || null },
        }),
      });
      const data = await res.json();
      if (data && data.ok) {
        clearCart();
        setCartOpen(false);
        setCgvAccepted(false);
        setTransferResult({ orderId: data.orderId, total: data.total, dueAt: data.dueAt });
      } else {
        setCheckoutError((data && data.error) || "Impossible d'enregistrer la commande. Merci de réessayer.");
      }
    } catch (e) {
      setCheckoutError("Impossible de contacter le service. Vérifiez votre connexion et réessayez.");
    }
    setCheckoutLoading(false);
  };
  const handleCheckout = async () => {
    setCheckoutNotice(false);
    setCheckoutError("");
    if (!cgvAccepted) {
      setCheckoutError("Merci d'accepter les conditions générales de vente avant de valider votre commande.");
      return;
    }
    if (paymentMethod === "transfer") {
      await submitTransferOrder();
      return;
    }
    setCheckoutLoading(true);
    try {
      // ZENORIA_ORDER_OWNER_V1: ne jamais envoyer le jeton dans le JSON ou dans Stripe.
      const { data: checkoutAuth, error: checkoutAuthError } = await supabase.auth.getSession();
      if (checkoutAuthError) throw new Error("Session indisponible");
      const checkoutToken = checkoutAuth && checkoutAuth.session ? checkoutAuth.session.access_token : null;
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(checkoutToken ? { Authorization: `Bearer ${checkoutToken}` } : {}),
        },
        body: JSON.stringify({
          items: cartItems.map((it) => ({ id: it.id, qty: it.qty })),
          promoCode: promoCode || null,
        }),
      });
      const data = await res.json();
      if (data && data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError((data && data.error) || "Impossible de lancer le paiement. Merci de réessayer.");
        setCheckoutLoading(false);
      }
    } catch (e) {
      setCheckoutError("Impossible de contacter le service de paiement. Vérifiez votre connexion et réessayez.");
      setCheckoutLoading(false);
    }
  };
  const applyPromo = (e) => {
    if (e) e.preventDefault();
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (promoCodes[code]) {
      setPromoCode(code);
      setPromoError("");
      setPromoInput("");
      setPromoOpen(false);
    } else {
      setPromoError("Ce code promo n'est pas valide.");
    }
  };
  const removePromo = () => {
    setPromoCode("");
    setPromoError("");
  };
  const openProduct = (p, mode = "video") => {
    setSelectedMode(mode);
    setSelected(p);
  };
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };
  // Choisit une famille (ou aucune) : le catalogue est filtré, et une saison donne son ambiance animée à la page.
  const chooseFamily = (key) => {
    const family = key ? families.find((f) => f.key === key) : null;
    setSelectedFamily(family ? key : null);
    setFxClicked(family && family.is_season ? key : null);
  };
  // Descend au catalogue. On s'arrête 28 px avant le haut de la section : le titre se lit sous le menu fixe au lieu d'être collé contre lui.
  const scrollToCatalogue = () => {
    const catalogue = document.getElementById("collections");
    if (catalogue) window.scrollTo({ top: Math.max(0, catalogue.getBoundingClientRect().top + window.scrollY - 28), behavior: "smooth" });
  };
  // Un clic sur une carte saison la choisit et descend directement au catalogue ; un second clic revient à l'état initial (toutes les créations).
  const handleSeasonClick = (key) => {
    chooseFamily(selectedFamily === key ? null : key);
    scrollToCatalogue();
  };
  const filteredProducts = selectedFamily ? filterByFamily(products, families, selectedFamily) : products;
  const selectedFamilyData = selectedFamily ? families.find((f) => f.key === selectedFamily) || null : null;
  // Saison animée : réglage de l'administration, ou clic de la visiteuse, ou saison du moment
  // Le réglage de l'administration est lu avant tout affichage de l'animation (catalogLoading), pour qu'une animation désactivée ou forcée ne clignote pas au chargement.
  const fxAutoSeason = nowMs === null ? null : resolveFxSeason(parseFxSetting(null), fxClicked, new Date(nowMs));
  const fxSeason = nowMs === null || catalogLoading ? null : pickFxSeason(fxSetting, fxAutoSeason);
  // Bandeau : fermeture (mémorisée le temps de la visite) et bouton
  const closeBanner = () => {
    if (!currentBanner) return;
    const next = [...closedBanners, bannerKey(currentBanner)];
    setClosedBanners(next);
    writeClosedKeys(getSessionStorage(), next);
  };
  const handleBannerButton = (target, url) => {
    if (target === "custom" && url) {
      if (url.startsWith("/")) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (typeof target === "string" && target.startsWith("season:")) {
      chooseFamily(target.slice(7));
      scrollToCatalogue();
      return;
    }
    if (target === "quiz") {
      window.location.assign("/quiz");
      return;
    }
    scrollToSection("collections");
  };
  // Liens venus d'une autre page (le quiz) : « /#panier » ouvre le panier, « /#bague=nom » ouvre une fiche bague,
  // « /#saison=automne » filtre le catalogue. L'adresse est lue une seule fois, quand le catalogue est chargé, puis nettoyée.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (linkHandled.current || catalogLoading || typeof window === "undefined") return;
    linkHandled.current = true;
    const hash = window.location.hash || "";
    let handled = false;
    if (hash === "#panier" || hash.startsWith("#panier-quiz=")) {
      // « #panier-quiz=… » : la visiteuse vient du quiz et veut y revenir (le résultat est dans l'adresse)
      const back = parseCartReturnHash(hash);
      if (back) setQuizReturn("/quiz" + encodeResultHash(back));
      setCartOpen(true);
      handled = true;
    } else if (hash.startsWith("#bague=")) {
      let slug = "";
      try {
        slug = decodeURIComponent(hash.slice(7));
      } catch (e) {
        slug = "";
      }
      const product = products.find((p) => p.slug === slug);
      if (product) openProduct(product);
      handled = true;
    } else if (hash.startsWith("#saison=")) {
      let key = "";
      try {
        key = decodeURIComponent(hash.slice(8));
      } catch (e) {
        key = "";
      }
      if (families.some((f) => f.key === key)) {
        chooseFamily(key);
        setTimeout(scrollToCatalogue, 80);
      }
      handled = true;
    }
    if (handled) {
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch (e) {
        // adresse non modifiable : sans effet
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogLoading]);
  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32] selection:bg-[#dcc8dd]">
    <MediaGuard />
      <Head>
        <title>Zenoria — L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme</title>
        <meta name="description" content="Bagues façonnées à la main en cristaux Swarovski, rassemblées en quatre saisons : Printemps, Été, Automne et Hiver." />
      </Head>
      {previewingMaintenance && (
        <div role="status" data-testid="maintenance-preview" className="bg-red-700 text-white text-[12px] py-2 px-4 text-center">
          Mode maintenance actif : vous voyez le site grâce au lien d&apos;aperçu administrateur. Les visiteurs voient la page de maintenance.
        </div>
      )}
      {shopPaused && (
        <div role="status" data-testid="pause-banner" className="bg-amber-100 text-amber-900 text-[13px] py-2.5 px-4 text-center leading-5">
          <strong>Boutique en pause</strong> · les commandes sont temporairement fermées.
          {siteStatus.message ? ` ${siteStatus.message}` : ""}
          {pauseReturn ? ` Retour prévu : ${pauseReturn}.` : ""}
        </div>
      )}
      {currentBanner && (
        <BannerBar banner={currentBanner} nowMs={nowMs} onClose={closeBanner} onButton={handleBannerButton} />
      )}
      <div className="bg-[#342434] text-white/85 text-[11px] py-2 px-4 text-center tracking-wide">
        {shippingStripText(shippingCfg)}
      </div>
      <header className="sticky top-0 z-40 bg-[#fbf8f4]/95 backdrop-blur border-b border-[#eadfe4]">
        <div className="max-w-7xl mx-auto px-5 h-20 flex items-center justify-between">
          <CrystalLogo compact mode={logo} />
          <nav className="hidden lg:flex gap-7 text-sm">
            <button onClick={() => scrollToSection("collections")} className="hover:text-[#8f6075]">Bijoux</button>
            {familiesReady && <button onClick={() => scrollToSection("seasons")} className="hover:text-[#8f6075]">Les saisons</button>}
            <button onClick={() => scrollToSection("savoir-faire")} className="hover:text-[#8f6075]">Savoir-faire</button>
            <button onClick={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))} data-testid="nav-histoire" className="hover:text-[#8f6075]">Notre histoire</button>
            <button onClick={() => scrollToSection("philosophie")} className="hover:text-[#8f6075]">Notre philosophie</button>
            <a href="/quiz" data-testid="nav-quiz" className="hover:text-[#8f6075]">Quiz</a>
            <button onClick={() => scrollToSection("contact")} className="hover:text-[#8f6075]">Contact</button>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon"><Search size={19} /></Button>
            {/* Compte utilisateur */}
            <div className="relative hidden sm:block">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (user) {
                    setAccountMenuOpen(!accountMenuOpen);
                  } else {
                    setAuthModalOpen(true);
                  }
                }}
              >
                <User size={19} />
              </Button>
              {user && accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-[#eadfe4] p-4 z-50">
                  <div className="text-xs text-[#9a7384] uppercase tracking-widest mb-1">Connecté(e) en tant que</div>
                  <div className="text-sm font-medium truncate mb-3">{user.email}</div>
                  {isAdmin && (
                    <a
                      href="/admin"
                      className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b] mb-2"
                    >
                      <Settings size={16} /> Administration
                    </a>
                  )}
                  {/* ZENORIA_ACCOUNT_STEP11_V1 : espace cliente */}
                  <a href="/compte" data-testid="menu-account-link" className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b] mb-2">
                    <User size={16} /> Mon compte
                  </a>

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b]"
                  >
                    <LogOut size={16} /> Se déconnecter
                  </button>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setFavPanelOpen(true)} className="relative hidden sm:inline-flex" aria-label="Voir mes favoris">
              <Heart size={19} />
              {favIds.length > 0 && (
                <span className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
                  {favIds.length}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCartOpen(true)} className="relative" aria-label="Ouvrir le panier">
              <ShoppingBag size={19} />
              {cartCount > 0 && (
                <span className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
                  {cartCount}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(!menu)}>
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menu && (
          <div className="lg:hidden px-6 pb-5 flex flex-col gap-3 text-sm">
            <button onClick={() => { scrollToSection("collections"); setMenu(false); }} className="text-left">Bijoux</button>
            {familiesReady && <button onClick={() => { scrollToSection("seasons"); setMenu(false); }} className="text-left">Les saisons</button>}
            <button onClick={() => { scrollToSection("savoir-faire"); setMenu(false); }} className="text-left">Savoir-faire</button>
            <button onClick={() => { window.dispatchEvent(new Event(OPEN_STORY_EVENT)); setMenu(false); }} data-testid="nav-histoire-mobile" className="text-left">Notre histoire</button>
            <button onClick={() => { scrollToSection("philosophie"); setMenu(false); }} className="text-left">Notre philosophie</button>
            <a href="/quiz" data-testid="nav-quiz-mobile" onClick={() => setMenu(false)} className="text-left">Quiz</a>
            <button onClick={() => { scrollToSection("contact"); setMenu(false); }} className="text-left">Contact</button>
            <button onClick={() => { setFavPanelOpen(true); setMenu(false); }} className="text-left">
              Mes favoris{favIds.length > 0 ? ` (${favIds.length})` : ""}
            </button>
            {!authLoading && (
              user ? (
                <>
                  {isAdmin && <a href="/admin" className="text-left text-[#8f6075]">Administration</a>}
                  <a href="/compte" className="text-left text-[#8f6075]">Mon compte</a>

                  <button onClick={() => { handleLogout(); setMenu(false); }} className="text-left text-[#8f6075]">
                    Se déconnecter ({user.email})
                  </button>
                </>
              ) : (
                <button onClick={() => { setAuthModalOpen(true); setMenu(false); }} className="text-left text-[#8f6075]">
                  Connexion / Créer un compte
                </button>
              )
            )}
          </div>
        )}
      </header>
      <main>
        {/* HERO */}
        <section className="relative overflow-hidden min-h-[670px] flex items-center bg-[radial-gradient(circle_at_75%_40%,#ead5ee_0%,#fbf6f0_38%,#f0dbd4_70%,#dfc1c8_100%)]">
          <div className="absolute -right-24 top-10 h-[560px] w-[560px] rounded-full border border-white/50 bg-white/20 backdrop-blur-sm" />
          <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 items-center gap-14 relative z-10">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <div className="text-xs uppercase tracking-[.3em] text-[#8b6578] mb-5">
                {products.length > 0 ? `${products.length} ${products.length > 1 ? "bijoux" : "bijou"} · ` : ""}{siteTexts.hero_label}
              </div>
              <h1 className="font-serif text-6xl md:text-8xl leading-none mb-5 text-[#513642]">ZENORIA</h1>
              <p className="font-serif italic text-2xl md:text-3xl text-[#594856] mb-5">
                <TextLines text={siteTexts.hero_tagline} />
              </p>
              <p className="max-w-lg text-[#6e6268] leading-7 mb-8">
                <TextLines text={siteTexts.hero_intro} />
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => scrollToSection(familiesReady ? "seasons" : "collections")}
                  className="rounded-full bg-[#8f6075] hover:bg-[#71485b] px-7 h-12"
                >
                  Découvrir les saisons <ArrowRight className="ml-2" size={17} />
                </Button>
                <a
                  href="/quiz"
                  data-testid="hero-quiz-link"
                  className="inline-flex items-center justify-center rounded-full border border-[#9b7a89] px-7 h-12 bg-white/35 hover:bg-white/70 text-sm font-medium transition"
                >
                  Faire le quiz couleurs
                </a>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="relative flex justify-center">
              <div className="w-[420px] max-w-[88vw] aspect-square rounded-full bg-white/35 border border-white shadow-[0_30px_100px_rgba(91,54,77,.2)] overflow-hidden relative">
                {siteMedia.hero_video && siteMedia.hero_video.path ? (
                  <HeroVideo path={siteMedia.hero_video.path} fallback={products[0]} />
                ) : (
                  products[0] && <RingVisual product={products[0]} large circle video />
                )}
              </div>
              <div className="absolute right-0 bottom-8 rounded-2xl bg-white/65 backdrop-blur p-4 shadow-lg">
                <Gem className="text-[#9b6480] mb-2" />
                <div className="font-serif">{siteTexts.hero_badge_title}</div>
                <div className="text-xs text-[#756a70]">{siteTexts.hero_badge_sub}</div>
              </div>
            </motion.div>
          </div>
        </section>
        {/* LES SAISONS (familles) : quatre cartes lues dans la base, avec l'animation saisonnière discrète */}
        {familiesReady && (
          <section id="seasons" className="relative overflow-hidden">
            <div className="relative max-w-7xl mx-auto px-6 py-20">
              <div className="text-center mb-10">
                <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">{siteTexts.seasons_eyebrow}</div>
                <h2 className="font-serif text-4xl">{siteTexts.seasons_title}</h2>
                <p className="text-[#6e6268] mt-3 max-w-2xl mx-auto leading-7">
                  <TextLines text={siteTexts.seasons_intro} />
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="season-cards">
                {seasonCards.map((c) => (
                  <motion.button
                    type="button"
                    whileHover={{ y: -7 }}
                    key={c.key}
                    onClick={() => handleSeasonClick(c.key)}
                    aria-pressed={selectedFamily === c.key}
                    data-testid="season-card"
                    data-key={c.key}
                    style={{ background: c.grad }}
                    className={`text-left rounded-[2rem] p-6 min-h-[13rem] border shadow-sm transition ${
                      selectedFamily === c.key ? "border-[#8f6075] ring-2 ring-[#8f6075]" : "border-white"
                    }`}
                  >
                    <div className="mb-6 text-[#5c4452]"><SeasonIcon season={c.key} size={28} /></div>
                    <div className="font-serif text-2xl mb-1">{c.name}</div>
                    {c.tagline && <div className="text-sm text-[#5f5359]">{c.tagline}</div>}
                    {c.description && <div className="text-xs text-[#7a6a72] mt-1">{c.description}</div>}
                    <div className="flex items-center justify-between mt-5">
                      <div className="flex gap-1.5">
                        {c.palette.map((d, i) => (
                          <i key={i} className="h-4 w-4 rounded-full border border-white/70" style={{ background: d }} />
                        ))}
                      </div>
                      <span className="text-xs text-[#5f5359]">{c.count} création{c.count > 1 ? "s" : ""}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
              <div className="mt-6 text-center text-sm text-[#6b5a63] min-h-[40px]" data-testid="season-strip">
                {!selectedFamilyData && <span className="text-[#8b737e]">Touchez une saison pour la découvrir.</span>}
              </div>
            </div>
            <SeasonFx season={fxSeason} />
          </section>
        )}
        {/* COLLECTIONS / CATALOGUE */}
        <section id="collections" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-between items-end mb-9">
              <div>
                <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">La collection</div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h2 className="font-serif text-4xl">
                    {selectedFamilyData ? `Collection ${selectedFamilyData.name}` : "Nos créations"}
                  </h2>
                  {selectedFamilyData && (
                    <span data-testid="collection-count" className="rounded-full bg-[#f5edf1] px-3.5 py-1 text-sm text-[#6b5a63] whitespace-nowrap">
                      {filteredProducts.length} création{filteredProducts.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              {selectedFamily && (
                <button onClick={() => chooseFamily(null)} className="text-sm border-b border-[#6d4e5c]">
                  Voir toute la collection
                </button>
              )}
            </div>
            {familiesReady && (
              <div className="flex flex-wrap gap-2 mb-8" data-testid="family-chips">
                <button
                  type="button"
                  onClick={() => chooseFamily(null)}
                  aria-pressed={!selectedFamily}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 h-10 text-sm transition ${
                    !selectedFamily ? "bg-[#8f6075] text-white border-[#8f6075]" : "bg-white text-[#54434c] border-[#d9c5cc] hover:bg-[#f5edf1]"
                  }`}
                >
                  Toutes
                </button>
                {familyChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    data-testid="family-chip"
                    data-key={c.key}
                    onClick={() => chooseFamily(c.key)}
                    aria-pressed={selectedFamily === c.key}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 h-10 text-sm transition ${
                      selectedFamily === c.key ? "bg-[#8f6075] text-white border-[#8f6075]" : "bg-white text-[#54434c] border-[#d9c5cc] hover:bg-[#f5edf1]"
                    }`}
                  >
                    <i className="h-2.5 w-2.5 rounded-full" style={{ background: c.accent }} />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {catalogLoading ? (
              <p className="text-sm text-[#8b737e] text-center py-10">Chargement des créations...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="text-sm text-[#8b737e] text-center py-10">
                Notre catalogue est en cours de mise à jour, merci de repasser bientôt.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map((p) => (
                  <Card key={p.id} className="overflow-hidden rounded-[1.5rem] border-[#eee2e5] group">
                    <div className="relative">
                      <RingVisual product={p} />
                      <FamilyPill product={p} families={families} />
                      {p.isUnique === true && (
                        <span className="pointer-events-none absolute left-4 bottom-4 z-10 inline-flex items-center gap-1 rounded-full bg-white/85 backdrop-blur px-3 py-1 text-xs text-[#8f6075]">
                          ✦ Pièce unique
                        </span>
                      )}
                      <FavoriteButton
                        active={favIds.includes(p.id)}
                        onToggle={() => toggleFavorite(p.id)}
                        size={18}
                        className="absolute right-4 top-4 h-10 w-10 bg-white/80 z-10"
                      />
                      <button className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition z-[5]" onClick={() => openProduct(p)} aria-label={`Voir ${p.name}`} />
                    </div>
                    <CardContent className="p-5">
                      <div className="text-xs uppercase tracking-widest text-[#9a7384]">{productLabel(p, families, familiesReady)}</div>
                      <div className="flex justify-between items-start mt-2 gap-3">
                        <div className="min-w-0">
                          <div className="font-serif text-xl truncate">{p.name}</div>
                          <div className="mt-1.5">
                            <AvailabilityBadge product={p} />
                          </div>
                        </div>
                        <PriceTag product={p} className="font-medium whitespace-nowrap text-right" />
                      </div>
                      <p className="text-sm text-[#70656a] mt-3">{p.energy}</p>
                      <div className="flex gap-2 mt-4 text-xs text-[#826d77]">
                        <button
                          type="button"
                          onClick={() => openProduct(p, "photo")}
                          className="rounded-full bg-[#f5edf1] hover:bg-[#ead9e1] px-3 py-1 transition"
                        >
                          {p.photoCount} photo{p.photoCount > 1 ? "s" : ""}
                        </button>
                        <button
                          type="button"
                          onClick={() => openProduct(p, "video")}
                          className="rounded-full bg-[#f5edf1] hover:bg-[#ead9e1] px-3 py-1 transition"
                        >
                          {p.videoCount} vidéo
                        </button>
                      </div>
                      <Button onClick={() => addToCart(p)} variant="outline" className="w-full mt-5 rounded-full border-[#b88d9f] hover:bg-[#8f6075] hover:text-white">
                        Ajouter au panier
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
        {/* L'UNIVERS ZENORIA : rubrique de navigation vers Notre histoire, Savoir-faire, Philosophie et le Quiz */}
        <section id="univers-zenoria" className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">Découvrir</div>
            <h2 className="font-serif text-4xl">L&apos;univers Zenoria</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))}
              data-testid="univers-card-histoire"
              className="relative text-left rounded-[1.5rem] bg-[#3b2b39] p-6 hover:shadow-lg transition overflow-hidden"
            >
              <BookOpen className="text-white mb-4" size={26} />
              <div className="font-serif text-xl mb-1 text-[#c9a15f]">Notre histoire</div>
              <div className="text-sm text-white/70">Une aventure née d&apos;une passion pour les pierres et le sens.</div>
              <ArrowRight size={16} className="absolute right-5 bottom-5 text-[#c9a15f]" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("savoir-faire")}
              data-testid="univers-card-savoir-faire"
              className="relative text-left rounded-[1.5rem] bg-[#f5edf1] p-6 hover:shadow-lg transition overflow-hidden"
            >
              <Hand className="text-[#412f3b] mb-4" size={26} />
              <div className="font-serif text-xl mb-1 text-[#412f3b]">Notre savoir-faire</div>
              <div className="text-sm text-[#70656a]">Des bijoux façonnés avec exigence et bienveillance.</div>
              <ArrowRight size={16} className="absolute right-5 bottom-5 text-[#8f6075]" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("philosophie")}
              data-testid="univers-card-philosophie"
              className="relative text-left rounded-[1.5rem] bg-[#8f6075] p-6 hover:shadow-lg transition overflow-hidden"
            >
              <Gem className="text-white mb-4" size={26} />
              <div className="font-serif text-xl mb-1 text-white">Notre philosophie</div>
              <div className="text-sm text-white/70">Des créations qui vous ressemblent, pour illuminer votre quotidien.</div>
              <ArrowRight size={16} className="absolute right-5 bottom-5 text-white" />
            </button>
            <a
              href="/quiz"
              data-testid="univers-card-quiz"
              className="relative text-left block rounded-[1.5rem] bg-[#fbf8f4] p-6 hover:shadow-lg transition overflow-hidden border border-[#eee2e5]"
            >
              <Sparkles className="text-[#412f3b] mb-4" size={26} />
              <div className="font-serif text-xl mb-1 text-[#412f3b]">Le quiz couleurs</div>
              <div className="text-sm text-[#70656a]">Trouvez les pierres qui résonnent avec votre énergie.</div>
              <ArrowRight size={16} className="absolute right-5 bottom-5 text-[#8f6075]" />
            </a>
          </div>
        </section>
        {/* SAVOIR-FAIRE */}
        <SavoirFaire product={products[0]} media={siteMedia.savoir_faire_photo} accent={(families.find((f) => f.key === fxSeason) || {}).accent} texts={siteTexts} />
        {/* PHILOSOPHIE */}
        <section id="philosophie" className="grid grid-cols-1 lg:grid-cols-2 min-h-[540px]">
          <div className="bg-gradient-to-br from-[#d8c4d9] via-[#f5e8e6] to-[#dbc9a9] grid grid-cols-1 place-items-center p-6 sm:p-12">
            <div className="w-80 max-w-full aspect-square rounded-full border border-white/60 bg-white/30 shadow-2xl grid place-items-center">
              <CrystalLogo mode={logo} />
            </div>
          </div>
          <div className="bg-[#3b2b39] text-white p-12 lg:p-20 flex flex-col justify-center">
            <div className="text-xs tracking-[.3em] uppercase text-[#d7b4c3] mb-4">Notre philosophie</div>
            <h2 className="font-serif text-4xl md:text-5xl leading-tight mb-6">
              <TextLines text={siteTexts.philo_title} />
            </h2>
            <p className="text-white/70 leading-7 max-w-xl">
              <TextLines text={siteTexts.philo_text} />
            </p>
            <Button variant="outline" className="mt-8 w-fit rounded-full border-white/40 bg-transparent text-white" onClick={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))}>
              {siteTexts.philo_button}
            </Button>
          </div>
        </section>
        {/* NOTRE HISTOIRE : textes modifiables dans /admin > Contenu du site > Textes du site */}
        <StorySection texts={siteTexts} />
        {/* AVIS CLIENTES : visibles si l'interrupteur est sur ON, ou en aperçu pour l'administration */}
        {(reviewsCfg.enabled || isAdmin) && <ReviewsSection reviewsCfg={reviewsCfg} isAdmin={isAdmin} products={products} />}
        {/* QUIZ COULEURS (invitation) : la page du quiz est /quiz */}
        <section id="quiz" className="max-w-6xl mx-auto px-6 py-20">
          <div className="rounded-[2.5rem] p-8 md:p-12 grid lg:grid-cols-[1.2fr_.8fr] gap-10 items-center" style={{ background: "linear-gradient(120deg,#eee3f5,#f6e3df)" }}>
            <div>
              <div className="text-xs tracking-[.3em] text-[#956d83] uppercase mb-3">Quiz couleurs</div>
              <h2 className="font-serif text-4xl mb-4">{siteTexts.quiz_title}</h2>
              <p className="text-[#6d6068] leading-7 mb-6">
                <TextLines text={siteTexts.quiz_text} />
              </p>
              <a
                href="/quiz"
                data-testid="teaser-quiz-link"
                className="inline-flex items-center gap-2 rounded-full bg-[#8d5e74] hover:bg-[#7a4e63] text-white px-7 h-12 text-sm font-medium transition"
              >
                Lancer le quiz <ArrowRight size={16} />
              </a>
              <div className="text-xs text-[#8b737e] mt-3">3 choix · moins de 2 minutes · rien n&apos;est enregistré</div>
            </div>
            <div className="max-w-[260px] mx-auto w-full">
              <Mannequin hair="#8b6a4a" eye="#8a5a2b" skin="#e0b184" garment="#c8643b" decorative />
            </div>
          </div>
        </section>
        {/* NEWSLETTER */}
        <section id="contact" className="bg-[#d9c5cc] py-16">
          <div className="max-w-5xl mx-auto px-6 text-center">
            <div className="text-xs tracking-[.3em] uppercase mb-3">Le cercle Zenoria</div>
            <h2 className="font-serif text-4xl mb-4">Recevez nos nouveautés</h2>
            <p className="mb-7 text-[#61535a]">Inspirations, nouvelles créations et attentions exclusives.</p>
            <div className="max-w-xl mx-auto flex bg-white rounded-full p-1.5">
              <input placeholder="Votre adresse e-mail" className="flex-1 px-5 bg-transparent outline-none min-w-0" />
              <Button className="rounded-full bg-[#7b5266]">Je m&apos;inscris</Button>
            </div>
          </div>
        </section>
      </main>
      <Footer
        seasons={seasonCards}
        seasonsOnClick={(key) => { chooseFamily(key); scrollToCatalogue(); }}
        logoMode={logo}
        logoCompact={true}
        logoDark={true}
      />
      {/* PANIER */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/35 z-50" onClick={() => setCartOpen(false)} />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              style={{ height: "100dvh" }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-[#fbf8f4] z-50 shadow-2xl flex flex-col"
            >
              <div className="relative flex-none flex justify-between items-center gap-3 px-5 py-4 border-b border-[#eadfe4]">
                <div className="min-w-0">
                  <h3 className="font-serif text-2xl leading-none">{transferStep ? "Livraison" : recapStep ? "Récapitulatif" : "Votre panier"}</h3>
                  {cartCount > 0 && (
                    <div className="text-xs text-[#8b737e] mt-1.5">
                      {cartCount} article{cartCount > 1 ? "s" : ""}
                      <span className="mx-1.5">·</span>
                      <button onClick={clearCart} className="underline">Vider le panier</button>
                    </div>
                  )}
                  {showShipHeader && (
                    <div data-testid="ship-progress-line" className="mt-2 flex items-center gap-1.5 text-xs text-[#54434c] min-[430px]:hidden">
                      <Truck size={14} className="text-[#8f6075] shrink-0" />
                      {totals.freeShipping ? (
                        <span className="font-semibold">Livraison offerte 🎉</span>
                      ) : (
                        <span>Plus que <strong>{formatPrice(totals.remaining)}</strong> pour la livraison offerte</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {showShipHeader && (
                    <div data-testid="ship-progress-right" className="hidden min-[430px]:flex items-center gap-1.5 text-[11px] leading-tight text-right text-[#54434c]">
                      <Truck size={14} className="text-[#8f6075] shrink-0" />
                      {totals.freeShipping ? (
                        <strong className="text-[12px] text-[#412f3b]">Livraison offerte 🎉</strong>
                      ) : (
                        <div><strong className="block text-[12px] text-[#412f3b]">Plus que {formatPrice(totals.remaining)}</strong>pour la livraison offerte</div>
                      )}
                    </div>
                  )}
                  <button onClick={() => setCartOpen(false)} className="h-10 w-10 rounded-full grid place-items-center hover:bg-[#f0e6ea]" aria-label="Fermer le panier">
                    <X />
                  </button>
                </div>
                {showShipHeader && (
                  <div className="absolute left-0 right-0 -bottom-px h-[3px] bg-[#f0e6ea]" aria-hidden="true">
                    <div className="h-full bg-[#8f6075] transition-all" style={{ width: `${totals.freeShipping ? 100 : progress}%` }} />
                  </div>
                )}
              </div>
              {cartLines.length === 0 ? (
                <div className="flex-1 grid place-items-center p-8 text-center">
                  <div>
                    <ShoppingBag className="mx-auto text-[#b88d9f] mb-4" size={40} />
                    <div className="font-serif text-2xl mb-2">Votre panier est vide</div>
                    <p className="text-sm text-[#756a70] mb-6">Découvrez nos créations et laissez-vous guider par vos couleurs.</p>
                    <button
                      onClick={() => { setCartOpen(false); scrollToSection("collections"); }}
                      className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm"
                    >
                      Continuer mes achats
                    </button>
                    {quizReturn && (
                      <div className="mt-3">
                        <a href={quizReturn} data-testid="cart-back-quiz" className="inline-flex items-center justify-center rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white px-6 h-11 text-sm font-medium transition">
                          Retour au quiz
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ) : recapStep ? (
                <>
                  <div data-testid="transfer-recap-step" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
                    <button type="button" onClick={() => { setCartStep("shipping"); setCheckoutError(""); }} data-testid="transfer-recap-back" className="text-sm font-bold text-[#8f6075] underline">← Retour à la livraison</button>
                    <div className="rounded-xl bg-white border border-[#eee2e5] px-3 py-2">
                      {cartLines.map(({ product: p, qty }) => (
                        <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                          <CartThumb product={p} size="h-9 w-9" />
                          <div className="flex-1 min-w-0 truncate">{p.name}<span className="text-[#8b737e]"> × {qty}</span></div>
                          <div className="font-medium">{formatPrice(effectivePrice(p) * qty)}</div>
                        </div>
                      ))}
                      <div className="border-t border-[#f0e6ea] mt-1 pt-2 text-[13px] text-[#54434c] space-y-0.5">
                        <div className="flex justify-between"><span>Sous-total</span><span>{formatPrice(totals.subtotal)}</span></div>
                        {totals.discount > 0 && (
                          <div className="flex justify-between text-emerald-700"><span>{"Remise" + (promoCode ? " (" + promoCode + ")" : "")}</span><span>-{formatPrice(totals.discount)}</span></div>
                        )}
                        <div className="flex justify-between"><span>Livraison (France)</span><span>{totals.shipping === 0 ? "Offerte" : formatPrice(totals.shipping)}</span></div>
                        <div className="text-[11px] text-[#8b737e]">TVA non applicable, art. 293 B du CGI</div>
                      </div>
                    </div>
                    <div data-testid="transfer-recap-address" className="rounded-xl bg-white border border-[#eee2e5] px-3 py-2 text-[13px] text-[#54434c] flex items-start gap-2">
                      <div className="flex-1 min-w-0"><span className="font-medium text-[#412f3b]">Livraison</span> · {transferShipping.fullName.trim()}, {transferShipping.line1.trim()}{transferShipping.line2.trim() ? " (" + transferShipping.line2.trim() + ")" : ""}, {transferShipping.postalCode.trim()} {transferShipping.city.trim()}</div>
                      <button type="button" onClick={() => { setCartStep("shipping"); setCheckoutError(""); }} className="shrink-0 underline text-[#8f6075]">Modifier</button>
                    </div>
                    <div data-testid="transfer-recap-payment" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-3 text-[12px] leading-5 text-[#54434c]">
                      <div className="text-[13px] font-medium text-[#412f3b]">Paiement par virement bancaire</div>
                      <p className="mt-1">Une fois la commande validée, nous vous donnons l&apos;IBAN, le BIC et la référence à indiquer dans votre virement.</p>
                      <p className="mt-1.5">Nous réservons vos pièces pour vous pendant <strong>{transferDelayDays ? transferDelayDays + " jour" + (transferDelayDays > 1 ? "s" : "") : "le délai indiqué à la confirmation"}</strong> après validation. Passé ce délai sans virement reçu, la commande est annulée automatiquement et les pièces sont remises en vente. La date et l&apos;heure exactes vous sont données à la confirmation.</p>
                    </div>
                  </div>
                  <div className="flex-none border-t border-[#eadfe4] bg-white/80 px-5 py-4 space-y-3">
                    <label className="flex items-start gap-2 text-[12px] text-[#54434c] leading-5">
                      <input type="checkbox" checked={cgvAccepted} onChange={(e) => { setCgvAccepted(e.target.checked); setCheckoutError(""); }} data-testid="cgv-checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#8f6075]" />
                      <span>J&apos;ai lu et j&apos;accepte les{" "}<a href="/cgv" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">conditions générales de vente</a>{" "}et les{" "}<a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">mentions légales</a></span>
                    </label>
                    <div className="flex justify-between font-bold text-base text-[#342b32]"><span>Total TTC</span><span>{formatPrice(totals.total)}</span></div>
                    <button onClick={handleCheckout} disabled={shopPaused || checkoutLoading || !cgvAccepted} data-testid="transfer-submit-button" className="w-full h-14 rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c]">
                      {shopPaused ? (
                        <span className="text-sm font-medium">Commandes temporairement fermées</span>
                      ) : checkoutLoading ? (
                        <span className="text-sm font-medium">Enregistrement de la commande...</span>
                      ) : (
                        <>
                          <span className="block text-sm font-medium">Je commande et je règle par virement</span>
                          <span className="block text-[11px] font-normal opacity-90">commande avec obligation de paiement</span>
                        </>
                      )}
                    </button>
                    {checkoutError && (
                      <p role="alert" className="text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5">{checkoutError}</p>
                    )}
                  </div>
                </>
              ) : transferStep ? (
                <>
                  <div data-testid="transfer-shipping-step" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                    <button type="button" onClick={() => { setCartStep("cart"); setCheckoutError(""); }} data-testid="transfer-back-to-cart" className="text-sm font-bold text-[#8f6075] underline">← Retour au mode de paiement</button>
                    <div data-testid="transfer-shipping-form" className="space-y-2">
                      <div className="text-[13px] font-medium text-[#412f3b]">Livraison (France)</div>
                      <input value={transferShipping.fullName} onChange={(e) => setTransferShipping((s) => ({ ...s, fullName: e.target.value }))} placeholder="Nom et prénom" autoComplete="name" data-testid="transfer-ship-name" className="w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]" />
                      <input value={transferShipping.line1} onChange={(e) => setTransferShipping((s) => ({ ...s, line1: e.target.value }))} placeholder="Adresse" autoComplete="address-line1" data-testid="transfer-ship-line1" className="w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]" />
                      <input value={transferShipping.line2} onChange={(e) => setTransferShipping((s) => ({ ...s, line2: e.target.value }))} placeholder="Complément d'adresse (facultatif)" autoComplete="address-line2" data-testid="transfer-ship-line2" className="w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]" />
                      <div className="grid grid-cols-3 gap-2">
                        <input value={transferShipping.postalCode} onChange={(e) => setTransferShipping((s) => ({ ...s, postalCode: e.target.value }))} placeholder="Code postal" inputMode="numeric" maxLength={5} autoComplete="postal-code" data-testid="transfer-ship-postal" className="w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]" />
                        <input value={transferShipping.city} onChange={(e) => setTransferShipping((s) => ({ ...s, city: e.target.value }))} placeholder="Ville" autoComplete="address-level2" data-testid="transfer-ship-city" className="col-span-2 w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]" />
                      </div>
                      <input value={transferShipping.phone} onChange={(e) => setTransferShipping((s) => ({ ...s, phone: e.target.value }))} placeholder="Téléphone (facultatif)" inputMode="tel" autoComplete="tel" data-testid="transfer-ship-phone" className="w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]" />
                      <p className="text-[11px] text-[#8b737e]">Livraison en France uniquement. L&apos;adresse e-mail de votre compte est utilisée pour cette commande.</p>
                    </div>
                  </div>
                  <div className="flex-none border-t border-[#eadfe4] bg-white/80 px-5 py-4 space-y-3">
                    <button type="button" onClick={goToTransferRecap} disabled={shopPaused} data-testid="transfer-continue-button" className="w-full h-12 rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed">Continuer vers le récapitulatif</button>
                    {checkoutError && (
                      <p role="alert" className="text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5">{checkoutError}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {cartNotice && (
                    <div className="flex-none px-5 pt-3">
                      <div className="text-xs rounded-lg bg-amber-50 text-amber-700 px-3 py-2">{cartNotice}</div>
                    </div>
                  )}
                  <div className={`flex-1 min-h-0 overflow-y-auto px-5 py-2 ${cartDensity === "dense" ? "space-y-2" : "space-y-3"}`}>
                    {cartLines.map(({ product: p, qty }) => {
                      const avail = getAvailability(p, qty);
                      return (
                        <div key={p.id} className={`flex gap-3 bg-white rounded-2xl border border-[#eee2e5] ${cartDensity === "dense" ? "p-2" : "p-3"}`}>
                          <CartThumb product={p} size={dens.thumb} />
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div className="flex justify-between gap-2">
                              <div className="min-w-0">
                                <div className={`font-serif leading-tight truncate ${dens.name}`}>{p.name}</div>
                                <div className="text-xs text-[#8b737e] mt-0.5 truncate">{p.collection}</div>
                              </div>
                              {p.isUnique === true && (
                                <button
                                  onClick={() => removeLine(p)}
                                  className="h-7 w-7 shrink-0 rounded-full grid place-items-center text-[#9a7384] hover:bg-[#f0e6ea]"
                                  aria-label={`Retirer ${p.name} du panier`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                            {cartDensity === "comfort" && (
                              <div className="mt-1.5">
                                <AvailabilityBadge product={p} qty={qty} showDetail />
                              </div>
                            )}
                            {cartDensity !== "comfort" && avail.state !== "in-stock" && (
                              <div className="text-[11px] text-amber-700 mt-1">{avail.detail}</div>
                            )}
                            <div className={`flex items-center justify-between ${cartDensity === "dense" ? "mt-1" : "mt-2"}`}>
                              {p.isUnique === true ? (
                                <span className="text-xs text-[#8b737e]">Pièce unique · 1 exemplaire</span>
                              ) : (
                                <span />
                              )}
                              <div className="font-medium text-sm">{formatPrice(effectivePrice(p) * qty)}</div>
                            </div>
                          </div>
                          {p.isUnique !== true && (
                            <div data-testid={"cart-qty-" + p.id} className="flex flex-col items-center justify-between self-stretch shrink-0 w-8 rounded-full border border-[#d9c5cc] py-0.5">
                              <button
                                onClick={() => changeQty(p, 1)}
                                className="h-6 w-6 grid place-items-center rounded-full hover:bg-[#f5edf1]"
                                aria-label="Augmenter la quantité"
                              >
                                <Plus size={13} />
                              </button>
                              <span className="text-sm leading-none">{qty}</span>
                              <button
                                onClick={() => (qty <= 1 ? removeLine(p) : changeQty(p, -1))}
                                className="h-6 w-6 grid place-items-center rounded-full hover:bg-[#f5edf1]"
                                aria-label={qty <= 1 ? "Retirer " + p.name + " du panier" : "Diminuer la quantité"}
                              >
                                {qty <= 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {promo ? (
                      <div className="flex items-center justify-between rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <Tag size={14} className="shrink-0" />
                          <span className="truncate">{promoCode} · {promo.label}</span>
                        </span>
                        <button onClick={removePromo} className="text-xs underline shrink-0 ml-2">Retirer</button>
                      </div>
                    ) : promoOpen ? (
                      <form onSubmit={applyPromo}>
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={promoInput}
                            onChange={(e) => { setPromoInput(e.target.value); setPromoError(""); }}
                            placeholder="Code promo"
                            className="flex-1 min-w-0 rounded-full border border-[#d9c5cc] bg-white px-4 h-9 text-sm outline-none focus:border-[#8f6075] uppercase placeholder:normal-case"
                          />
                          <button
                            type="submit"
                            className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white px-4 h-9 text-sm transition"
                          >
                            Appliquer
                          </button>
                          <button
                            type="button"
                            onClick={() => { setPromoOpen(false); setPromoError(""); setPromoInput(""); }}
                            className="h-9 w-9 shrink-0 rounded-full grid place-items-center text-[#8b737e] hover:bg-[#f0e6ea]"
                            aria-label="Fermer le code promo"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        {promoError && <div className="text-xs text-red-600 mt-1.5 px-1">{promoError}</div>}
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPromoOpen(true)}
                        className="flex items-center gap-1.5 text-sm text-[#8f6075] underline"
                      >
                        <Tag size={14} /> Vous avez un code promo ?
                      </button>
                    )}
                    <div className={`text-[#54434c] ${tightFooter ? "text-xs space-y-0.5" : "text-sm space-y-1"}`}>
                      <div className="flex justify-between">
                        <span>Sous-total</span>
                        <span>{formatPrice(totals.subtotal)}</span>
                      </div>
                      {totals.discount > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Remise</span>
                          <span>-{formatPrice(totals.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Livraison (France)</span>
                        <span>{totals.shipping === 0 ? "Offerte" : formatPrice(totals.shipping)}</span>
                      </div>
                    </div>
                    {shippingCfg.enabled && !totals.freeShipping && (
                      <div className="text-[11px] text-[#8b737e]">Livraison offerte dès {shippingCfg.threshold} € en France</div>
                    )}
                  </div>
                  <div className={`flex-none border-t border-[#eadfe4] bg-white/80 px-5 ${tightFooter ? "py-3 space-y-2" : "py-4 space-y-3"}`}>
                    <div data-testid="cart-total" className="flex justify-between font-bold text-base text-[#342b32]">
                      <span>Total TTC</span>
                      <span>{formatPrice(totals.total)}</span>
                    </div>
                    {paymentMethodsLoaded && paymentMethodsCfg.transfer_enabled && (
                      <div data-testid="payment-method-choice" className="space-y-2">
                        {paymentMethodsCfg.stripe_enabled && (
                          <>
                            <div className="sr-only">Moyen de paiement</div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => { setPaymentMethod("card"); setCheckoutError(""); }}
                                data-testid="payment-method-card"
                                className={`rounded-xl border px-3 py-2 text-sm text-left transition ${paymentMethod === "card" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}`}
                              >
                                Carte bancaire
                              </button>
                              <button
                                type="button"
                                onClick={() => { setPaymentMethod("transfer"); setCheckoutError(""); }}
                                data-testid="payment-method-transfer"
                                className={`rounded-xl border px-3 py-2 text-sm text-left transition ${paymentMethod === "transfer" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}`}
                              >
                                Virement bancaire
                              </button>
                            </div>
                          </>
                        )}
                        {(paymentMethod === "transfer" || !paymentMethodsCfg.stripe_enabled) && (
                          <div data-testid="transfer-info" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-3 text-[12px] text-[#54434c] leading-5 space-y-1.5">
                            {!paymentMethodsCfg.stripe_enabled && (
                              <div data-testid="transfer-only-notice" className="text-[13px] font-medium text-[#412f3b]">Paiement par virement bancaire</div>
                            )}
                            {!user && (
                              <p data-testid="transfer-auth-required">Un compte Zenoria est nécessaire. Il se crée en quelques secondes, sans quitter votre panier, et vous donne accès à vos commandes, vos factures et au suivi de votre livraison.</p>
                            )}
                            <p>Après la validation de votre commande, vous recevez les coordonnées bancaires pour effectuer le virement.</p>
                          </div>
                        )}
                      </div>
                    )}
                    {paymentMethodsLoaded && !paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled && (
                      <div data-testid="no-payment-method-available" className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[12px] text-amber-900 leading-5">
                        Aucun moyen de paiement n&apos;est disponible actuellement. Merci de réessayer plus tard ou de nous contacter.
                      </div>
                    )}

                    {paymentMethodsLoaded && paymentMethodsCfg.stripe_enabled && paymentMethod === "card" && !user && (
                      <p data-testid="account-choice-line" className="text-[12px] text-[#70656a] leading-5">
                        Déjà cliente ?{" "}
                        <button
                          type="button"
                          onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }}
                          data-testid="account-choice-login"
                          className="underline text-[#8f6075]"
                        >
                          Se connecter
                        </button>
                        {" "}·{" "}Nouvelle ?{" "}
                        <button
                          type="button"
                          onClick={() => { setAuthModalMode("signup"); setAuthModalOpen(true); }}
                          data-testid="account-choice-signup"
                          className="underline text-[#8f6075]"
                        >
                          Créer un compte
                        </button>
                        {" "}(facultatif, vous pouvez continuer sans)
                      </p>
                    )}
                    {paymentMethod === "card" && (
                    <label className="flex items-start gap-2 text-[12px] text-[#54434c] leading-5">
                      <input
                        type="checkbox"
                        checked={cgvAccepted}
                        onChange={(e) => { setCgvAccepted(e.target.checked); setCheckoutError(""); }}
                        data-testid="cgv-checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#8f6075]"
                      />
                      <span>
                        J&apos;ai lu et j&apos;accepte les{" "}
                        <a href="/cgv" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">
                          conditions générales de vente
                        </a>{" "}
                        et les{" "}
                        <a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">
                          mentions légales
                        </a>
                      </span>
                    </label>
                    )}
                    {paymentMethod === "transfer" && !user ? (
                      <>
                        <button type="button" onClick={() => { setAuthModalMode("signup"); setAuthModalOpen(true); }} data-testid="transfer-auth-signup" className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition ${tightFooter ? "h-11" : "h-12"}`}>Créer mon compte</button>
                        <div className="text-[12px] text-center text-[#54434c]">
                          J&apos;ai déjà un compte · {" "}
                          <button type="button" onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }} data-testid="transfer-auth-login" className="underline text-[#8f6075]">Me connecter</button>
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={paymentMethod === "transfer" ? () => { if (user) { setCheckoutError(""); setCartStep("shipping"); } else { setAuthModalMode("login"); setAuthModalOpen(true); } } : handleCheckout}
                        disabled={shopPaused || checkoutLoading || !paymentMethod || (paymentMethod === "card" && !cgvAccepted) || !paymentMethodsLoaded || (!paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled)}
                        data-testid="checkout-button"
                        className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c] ${tightFooter ? "h-11" : "h-12"}`}
                      >
                        {shopPaused ? "Commandes temporairement fermées" : checkoutLoading ? (paymentMethod === "transfer" ? "Enregistrement de la commande..." : "Redirection vers le paiement...") : paymentMethod === "transfer" ? "Continuer vers la livraison" : !paymentMethod ? "Choisissez un mode de paiement" : "Commander"}
                      </button>
                    )}
                    {quizReturn && (
                      <a href={quizReturn} data-testid="cart-back-quiz" className="flex w-full items-center justify-center rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white text-sm font-medium transition h-11">
                        Retour au quiz
                      </a>
                    )}
                    {shopPaused ? (
                      <p data-testid="pause-note" className="text-[11px] text-center rounded-lg bg-amber-50 text-amber-800 px-3 py-1.5">
                        La boutique est en pause{pauseReturn ? ` jusqu'au ${pauseReturn}` : ""}. Votre panier est conservé sur cet appareil.
                      </p>
                    ) : checkoutError ? (
                      <p className="text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5">
                        {checkoutError}
                      </p>
                    ) : (
                      paymentMethod === "card" && paymentMethodsCfg.stripe_enabled ? <p className="text-[11px] text-center text-[#7e7378]">Paiement sécurisé via Stripe.</p> : null
                    )}
                  </div>
                </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      {/* ZENORIA_ACCOUNT_STEP14_V1 : panneau « Mes commandes & avis » retiré, son contenu vit désormais dans /compte#avis */}
      {/* MES FAVORIS */}
      <AnimatePresence>
        {favPanelOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/35 z-50" onClick={() => setFavPanelOpen(false)} />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              style={{ height: "100dvh" }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-[#fbf8f4] z-50 shadow-2xl flex flex-col"
            >
              <div className="flex-none flex justify-between items-center px-5 py-4 border-b border-[#eadfe4]">
                <div className="min-w-0">
                  <h3 className="font-serif text-2xl leading-none">Mes favoris</h3>
                  {favoriteLines.length > 0 && (
                    <div className="text-xs text-[#8b737e] mt-1.5">
                      {favoriteLines.length} création{favoriteLines.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <button onClick={() => setFavPanelOpen(false)} className="h-10 w-10 rounded-full grid place-items-center hover:bg-[#f0e6ea]" aria-label="Fermer mes favoris">
                  <X />
                </button>
              </div>
              {!user && (
                <p className="flex-none px-5 pt-3 text-[12px] text-[#70656a] leading-5">
                  Vos favoris sont conservés sur cet appareil.{" "}
                  <button
                    type="button"
                    onClick={() => { setFavPanelOpen(false); setAuthModalMode("signup"); setAuthModalOpen(true); }}
                    className="underline text-[#8f6075]"
                  >
                    Créez un compte
                  </button>{" "}
                  pour les retrouver sur tous vos appareils.
                </p>
              )}
              {favoriteLines.length === 0 ? (
                <div className="flex-1 grid place-items-center p-8 text-center">
                  <div>
                    <Heart className="mx-auto text-[#b88d9f] mb-4" size={40} />
                    <div className="font-serif text-2xl mb-2">Aucun favori pour l&apos;instant</div>
                    <p className="text-sm text-[#756a70] mb-6">Touchez le cœur d&apos;une création pour la retrouver ici.</p>
                    <button
                      onClick={() => { setFavPanelOpen(false); scrollToSection("collections"); }}
                      className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm"
                    >
                      Découvrir les créations
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
                  {favoriteLines.map((p) => (
                    <div key={p.id} className="flex gap-3 bg-white rounded-2xl border border-[#eee2e5] p-3">
                      <CartThumb product={p} size="h-16 w-16" />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-serif text-base leading-tight truncate">{p.name}</div>
                            <PriceTag product={p} className="text-sm mt-1 block" />
                          </div>
                          <FavoriteButton active onToggle={() => toggleFavorite(p.id)} size={18} />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => { setFavPanelOpen(false); openProduct(p); }}
                            className="rounded-full border border-[#d9c5cc] px-3 py-1 text-xs hover:bg-[#f5edf1]"
                          >
                            Voir la fiche
                          </button>
                          <button
                            type="button"
                            onClick={() => { addToCart(p); setFavPanelOpen(false); }}
                            className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs"
                          >
                            Ajouter au panier
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      {/* FICHE PRODUIT (composant partagé avec la page du quiz : components/ProductSheet.js) */}
      <ProductSheet
        product={selected}
        initialMode={selectedMode}
        label={selected ? productLabel(selected, families, familiesReady) : ""}
        onClose={() => setSelected(null)}
        onAdd={(p) => { addToCart(p); setSelected(null); }}
        favoriteActive={selected ? favIds.includes(selected.id) : false}
        onToggleFavorite={() => selected && toggleFavorite(selected.id)}
        ratingSlot={selected && (reviewsCfg.enabled || isAdmin) ? <ReviewRatingLine productId={selected.id} reviewsCfg={reviewsCfg} isAdmin={isAdmin} onSeeAll={() => { const id = selected.id; setSelected(null); openReviewsSection(id); }} /> : null}
        reviewsSlot={selected && (reviewsCfg.enabled || isAdmin) ? <ProductReviewsList productId={selected.id} reviewsCfg={reviewsCfg} isAdmin={isAdmin} onSeeAll={() => { const id = selected.id; setSelected(null); openReviewsSection(id); }} /> : null}
        uniqueNotice={<UniqueNotice product={selected} contactSettings={contactSettings} />}
      />
      {/* AUTHENTIFICATION */}
      <AuthModal open={authModalOpen} onClose={() => { setAuthModalOpen(false); setAuthModalMode("login"); }} initialMode={authModalMode} />
      {/* DECONNEXION : garder ou vider le panier ? */}
      {logoutAsk && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="logout-cart-title" data-testid="logout-cart-dialog">
          <div className="w-full max-w-sm rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">
            <h3 id="logout-cart-title" className="font-serif text-xl text-[#412f3b]">Voulez-vous garder votre panier ?</h3>
            <p className="mt-2 text-sm text-[#54434c]">Vous avez {cartCount} article{cartCount > 1 ? "s" : ""} dans votre panier.</p>
            <button type="button" onClick={() => finishLogout("keep")} data-testid="logout-keep" className="mt-5 w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white h-11 text-sm font-medium transition">Oui, garder mes articles</button>
            <button type="button" onClick={() => finishLogout("clear")} data-testid="logout-clear" className="mt-2 w-full rounded-full border border-[#82576c] text-[#82576c] hover:bg-[#f5edf1] h-11 text-sm font-medium transition">Non, vider le panier</button>
            <button type="button" onClick={() => setLogoutAsk(false)} data-testid="logout-cancel" className="mt-3 block mx-auto text-sm text-[#8f6075] underline">Rester connectée</button>
          </div>
        </div>
      )}
      {logoutNotice && (
        <div role="status" data-testid="logout-notice" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] max-w-[90vw] rounded-full bg-[#412f3b] text-white text-sm px-5 py-2.5 shadow-lg text-center">{logoutNotice}</div>
      )}
      {/* CONFIRMATION DE COMMANDE PAR VIREMENT (provisoire : IBAN et reference a l'etape 3e) */}
      {transferResult && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" data-testid="transfer-confirmation">
          <div className="w-full max-w-md rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">
            <h3 className="font-serif text-2xl text-[#412f3b]">Commande enregistrée</h3>
            <p className="mt-3 text-sm text-[#54434c]">Commande n°{transferResult.orderId} · {formatPrice(Number(transferResult.total))}</p>
            <p className="mt-1 text-sm text-[#54434c]">À régler par virement avant le {new Date(transferResult.dueAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" })}.</p>
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900">Étape en cours de construction : les coordonnées bancaires et la référence seront affichées ici. Retrouvez cette commande dans Mon compte.</p>
            <button type="button" onClick={() => setTransferResult(null)} data-testid="transfer-confirmation-close" className="mt-5 w-full rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm">Fermer</button>
          </div>
        </div>
      )}
      {/* CONFIRMATION DE PAIEMENT (retour de Stripe Checkout) */}
      <PaymentConfirmationModal open={paymentConfirmationOpen} onClose={() => setPaymentConfirmationOpen(false)} />
    </div>
  );
}
