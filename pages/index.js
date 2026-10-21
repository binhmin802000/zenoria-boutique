
import React, { useMemo, useState, useEffect, useRef } from "react";
import Head from "next/head";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, Search, User, Heart, Menu, X, Sparkles, ArrowRight,
  Gem, Instagram, LogOut, Minus, Plus, Trash2, Tag, Truck, Settings, Mail, MessageCircle, Send
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
import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting, qualifiesForFreeShipping, shippingStripText } from "@/lib/shippingSettings";
import { SITE_TEXTS_KEY, DEFAULT_TEXTS, resolveSiteTexts } from "@/lib/siteTexts";
// ZENORIA_STORY_REVIEWS_V1
import { REVIEWS_KEY, DEFAULT_REVIEWS, parseReviewsSetting } from "@/lib/reviewsSettings";
import StorySection, { OPEN_STORY_EVENT } from "@/components/StorySection";
// ZENORIA_REVIEWS_STEP1_V1 : panneau « Mes commandes & avis »
import MyReviewsPanel from "@/components/MyReviewsPanel";
// ZENORIA_REVIEWS_STEP3_V1 : affichage des avis (fiche bague + section) et aperçu admin
import { ReviewRatingLine, ProductReviewsList, ReviewsSection, openReviewsSection } from "@/components/Reviews";
import { Star as StarIcon } from "lucide-react";
import TextLines from "@/components/TextLines";
// ============================================================
// RÉGLAGES DE LA BOUTIQUE (à adapter facilement)
// ============================================================
const SHIPPING_FEE = 4.9;               // frais de livraison sous le seuil (France)
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
const round2 = (n) => Math.round(n * 100) / 100;
// Prix réellement appliqué : le prix promotionnel s'il est défini et inférieur au prix normal.
const effectivePrice = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);
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
    pitch: row.pitch || "",
    photos,
    video: row.video || null,
    color: row.color || "from-rose-300 via-pink-100 to-white",
    stone: row.stone || "💎",
    photoCount: photos.length,
    videoCount: row.video ? 1 : 0,
  };
}
// Calcul des montants du panier (sous-total, remise, livraison, total)
function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {
  const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));
  let discount = 0;
  if (promo && promo.type === "percent") discount = round2((subtotal * promo.value) / 100);
  if (promo && promo.type === "fixed") discount = Math.min(promo.value, subtotal);
  const discounted = round2(subtotal - discount);
  const freeByPromo = Boolean(promo && promo.type === "shipping");
  const qualifies = qualifiesForFreeShipping(shippingCfg, discounted);
  const shipping = lines.length === 0 ? 0 : freeByPromo || qualifies ? 0 : SHIPPING_FEE;
  const total = round2(discounted + shipping);
  const remaining = shippingCfg.enabled ? round2(Math.max(0, shippingCfg.threshold - discounted)) : 0;
  return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };
}
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
function CrystalLogo({ mode = 1, compact = false, dark = false }) {
  const styles = [
    "from-[#bd8792] via-[#d8b36d] to-[#705185]",
    "from-[#6f4a8e] via-[#ead4b0] to-[#bf8797]",
    "from-[#222] via-[#9d6f86] to-[#d7b66f]",
  ];
  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${compact ? "h-10 w-10" : "h-14 w-14"} rounded-full bg-gradient-to-br ${styles[mode - 1]} p-[2px] shadow-lg`}>
        <div className="relative h-full w-full rounded-full bg-[#fbf8f4] overflow-hidden">
          <div className="absolute -left-1 top-0 h-full w-[58%] rounded-r-full bg-gradient-to-br from-[#76518f] to-[#c89aa6]" />
          <div className="absolute right-1 top-1 h-[46%] w-[46%] rounded-full bg-[#fbf8f4]" />
          <div className="absolute left-2 bottom-2 h-2.5 w-2.5 rounded-full bg-[#fbf8f4] ring-1 ring-[#d8b36d]" />
          <div className="absolute right-3 top-3 h-2.5 w-2.5 rotate-45 bg-gradient-to-br from-white to-[#d8b36d] shadow" />
        </div>
      </div>
      <div>
        <div className={`${compact ? "text-xl" : "text-3xl"} tracking-[.22em] font-serif ${dark ? "text-white" : "text-[#412f3b]"}`}>ZENORIA</div>
        {!compact && <div className={`text-[10px] tracking-wide italic ${dark ? "text-white/60" : "text-[#755f6e]"}`}>L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</div>}
      </div>
    </div>
  );
}
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
  const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);
  const [viewportH, setViewportH] = useState(800);
  // Favoris : identifiants des bagues aimées. En mode invité, stockés dans le navigateur (lib/favorites.js) ;
  // une fois connectée, stockés dans Supabase (table customer_favorites), avec fusion additive à la connexion.
  const [favIds, setFavIds] = useState([]);
  const [favPanelOpen, setFavPanelOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
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
  const [reviewsPanelOpen, setReviewsPanelOpen] = useState(false); // panneau « Mes commandes & avis »
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
        optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select("key, value").in("key", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY])),
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
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAccountMenuOpen(false);
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
  const promo = promoCode ? promoCodes[promoCode] : null;
  const totals = useMemo(() => computeTotals(cartLines, promo, shippingCfg), [cartLines, promo, shippingCfg]);
  const progress = Math.min(100, Math.round(((totals.subtotal - totals.discount) / shippingCfg.threshold) * 100));
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
  const handleCheckout = async () => {
    setCheckoutNotice(false);
    setCheckoutError("");
    if (!cgvAccepted) {
      setCheckoutError("Merci d'accepter les conditions générales de vente avant de valider votre commande.");
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
                  {/* ZENORIA_REVIEWS_STEP1_V1 : avis ouverts, ou administration (tests) */}
                  {(reviewsCfg.enabled || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => { setAccountMenuOpen(false); setReviewsPanelOpen(true); }}
                      className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b] mb-2"
                    >
                      <StarIcon size={16} /> Mes commandes &amp; avis
                    </button>
                  )}
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
                  {(reviewsCfg.enabled || isAdmin) && (
                    <button onClick={() => { setReviewsPanelOpen(true); setMenu(false); }} className="text-left text-[#8f6075]">
                      Mes commandes &amp; avis
                    </button>
                  )}
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
                {products.length > 0 ? `${products.length} collections · ` : ""}{siteTexts.hero_label}
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
      <footer className="bg-[#2f252d] text-white/70 py-12">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-9">
          <div>
            <CrystalLogo compact mode={logo} dark />
            <p className="text-xs mt-5 leading-6">L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</p>
          </div>
          <div>
            <div className="text-white mb-3">Boutique</div>
            <div className="text-sm space-y-2">
              {familiesReady ? (
                seasonCards.map((c) => (
                  <p key={c.key}>
                    <button
                      type="button"
                      data-testid="footer-season"
                      onClick={() => { chooseFamily(c.key); scrollToCatalogue(); }}
                      className="text-left hover:text-white underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </button>
                  </p>
                ))
              ) : (
                <p>Collections</p>
              )}
            </div>
          </div>
          <div>
            <div className="text-white mb-3">Informations</div>
            <div className="text-sm space-y-2">
              <p className="flex items-center gap-2 text-white/40">
                Livraison et retours
                <span className="text-[10px] uppercase tracking-wide rounded-full border border-white/20 px-2 py-0.5">Bientôt</span>
              </p>
              <p className="flex items-center gap-2 text-white/40">
                FAQ
                <span className="text-[10px] uppercase tracking-wide rounded-full border border-white/20 px-2 py-0.5">Bientôt</span>
              </p>
              <p><a href="/mentions-legales" className="hover:text-white underline-offset-2 hover:underline">Mentions légales</a></p>
              <p><a href="/confidentialite" className="hover:text-white underline-offset-2 hover:underline">Politique de confidentialité</a></p>
              {reviewsCfg.enabled && <p><a href="/charte-des-avis" className="hover:text-white underline-offset-2 hover:underline">Charte des avis</a></p>}
            </div>
          </div>
          <div>
            <div className="text-white mb-3 flex items-center gap-2">
              Suivez-nous
              <span className="text-[10px] uppercase tracking-wide rounded-full border border-white/20 px-2 py-0.5 text-white/40">Bientôt</span>
            </div>
            <div className="flex gap-3 text-white/40">
              <Instagram />
              <Heart />
              <Sparkles />
            </div>
            {(contactSettings.email.enabled && contactSettings.email.value.trim()) ||
            (contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim()) ||
            (contactSettings.signal.enabled && contactSettings.signal.value.trim()) ? (
              <div className="mt-5">
                <div className="text-white mb-3">Nous contacter</div>
                <div className="flex gap-3">
                  {contactSettings.email.enabled && contactSettings.email.value.trim() && (
                    <a
                      href={buildMailtoLink(contactSettings.email.value.trim())}
                      aria-label="Nous écrire par e-mail"
                      title="Nous écrire par e-mail"
                      className="hover:text-[#8f6075]"
                    >
                      <Mail />
                    </a>
                  )}
                  {contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim() && (
                    <a
                      href={buildWhatsAppLink(contactSettings.whatsapp.value.trim())}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Nous écrire sur WhatsApp"
                      title="Nous écrire sur WhatsApp"
                      className="hover:text-[#8f6075]"
                    >
                      <MessageCircle />
                    </a>
                  )}
                  {contactSettings.signal.enabled && contactSettings.signal.value.trim() && (
                    <a
                      href={buildSignalLink(contactSettings.signal.value.trim())}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Nous écrire sur Signal"
                      title="Nous écrire sur Signal"
                      className="hover:text-[#8f6075]"
                    >
                      <Send />
                    </a>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-xs">
          <div>Photos et vidéos © 2026 Zenoria, reproduction interdite sans autorisation. Prototype e-commerce.</div>
          <div className="mt-2 text-[11px] text-white/50">
            Swarovski® est une marque de son propriétaire. Zenoria est une marque indépendante, non affiliée à Swarovski.
          </div>
        </div>
      </footer>
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
              <div className="flex-none flex justify-between items-center px-5 py-4 border-b border-[#eadfe4]">
                <div className="min-w-0">
                  <h3 className="font-serif text-2xl leading-none">Votre panier</h3>
                  {cartCount > 0 && (
                    <div className="text-xs text-[#8b737e] mt-1.5">
                      {cartCount} article{cartCount > 1 ? "s" : ""}
                      <span className="mx-1.5">·</span>
                      <button onClick={clearCart} className="underline">Vider le panier</button>
                    </div>
                  )}
                </div>
                <button onClick={() => setCartOpen(false)} className="h-10 w-10 rounded-full grid place-items-center hover:bg-[#f0e6ea]" aria-label="Fermer le panier">
                  <X />
                </button>
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
              ) : (
                <>
                  <div className="flex-none px-5 pt-3 pb-2">
                    {shippingCfg.enabled && (
                      <>
                    <div className="flex items-center gap-2 text-xs text-[#54434c]">
                      <Truck size={14} className="text-[#8f6075] shrink-0" />
                      {totals.freeShipping ? (
                        <span>Livraison offerte 🎉</span>
                      ) : (
                        <span>Plus que <strong>{formatPrice(totals.remaining)}</strong> pour la livraison offerte</span>
                      )}
                    </div>
                    <div className="h-1.5 rounded-full bg-[#f0e6ea] mt-2 overflow-hidden">
                      <div className="h-full rounded-full bg-[#8f6075] transition-all" style={{ width: `${totals.freeShipping ? 100 : progress}%` }} />
                    </div>
                    <div className="text-[11px] text-[#8b737e] mt-1.5">
                      Livraison offerte dès {shippingCfg.threshold} € en France
                    </div>
                      </>
                    )}
                    {cartNotice && (
                      <div className="text-xs rounded-lg bg-amber-50 text-amber-700 px-3 py-2 mt-2">{cartNotice}</div>
                    )}
                  </div>
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
                              <button
                                onClick={() => removeLine(p)}
                                className="h-7 w-7 shrink-0 rounded-full grid place-items-center text-[#9a7384] hover:bg-[#f0e6ea]"
                                aria-label={`Retirer ${p.name} du panier`}
                              >
                                <Trash2 size={15} />
                              </button>
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
                              <div className="flex items-center rounded-full border border-[#d9c5cc]">
                                <button
                                  onClick={() => changeQty(p, -1)}
                                  disabled={qty <= 1}
                                  className={`${dens.btn} grid place-items-center rounded-full hover:bg-[#f5edf1] disabled:opacity-30 disabled:hover:bg-transparent`}
                                  aria-label="Diminuer la quantité"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="w-7 text-center text-sm">{qty}</span>
                                <button
                                  onClick={() => changeQty(p, 1)}
                                  className={`${dens.btn} grid place-items-center rounded-full hover:bg-[#f5edf1]`}
                                  aria-label="Augmenter la quantité"
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                              <div className="font-medium text-sm">{formatPrice(effectivePrice(p) * qty)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`flex-none border-t border-[#eadfe4] bg-white/80 px-5 ${tightFooter ? "py-3 space-y-2" : "py-4 space-y-3"}`}>
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
                      <div className={`flex justify-between font-serif text-[#342b32] border-t border-[#eadfe4] ${tightFooter ? "text-lg pt-1.5" : "text-xl pt-2"}`}>
                        <span>Total TTC</span>
                        <span>{formatPrice(totals.total)}</span>
                      </div>
                    </div>
                    {!user && (
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
                        <a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">
                          conditions générales de vente et les mentions légales
                        </a>
                      </span>
                    </label>
                    <button
                      onClick={handleCheckout}
                      disabled={shopPaused || checkoutLoading || !cgvAccepted}
                      data-testid="checkout-button"
                      className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c] ${tightFooter ? "h-11" : "h-12"}`}
                    >
                      {shopPaused ? "Commandes temporairement fermées" : checkoutLoading ? "Redirection vers le paiement..." : "Commander"}
                    </button>
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
                      <p className="text-[11px] text-center text-[#7e7378]">Paiement sécurisé via Stripe.</p>
                    )}
                  </div>
                </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      {/* MES COMMANDES & AVIS (ZENORIA_REVIEWS_STEP1_V1) */}
      <MyReviewsPanel open={reviewsPanelOpen} onClose={() => setReviewsPanelOpen(false)} user={user} isAdmin={isAdmin} reviewsCfg={reviewsCfg} />
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
      />
      {/* AUTHENTIFICATION */}
      <AuthModal open={authModalOpen} onClose={() => { setAuthModalOpen(false); setAuthModalMode("login"); }} initialMode={authModalMode} />
      {/* CONFIRMATION DE PAIEMENT (retour de Stripe Checkout) */}
      <PaymentConfirmationModal open={paymentConfirmationOpen} onClose={() => setPaymentConfirmationOpen(false)} />
    </div>
  );
}
