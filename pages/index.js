import React, { useMemo, useState, useEffect } from "react";
import Head from "next/head";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, Search, User, Heart, Menu, X, Sparkles, ArrowRight,
  Star, Leaf, Shield, Gem, Instagram, LogOut, Minus, Plus, Trash2, Tag, Truck, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase, getMediaUrl } from "@/lib/supabase";
import AuthModal from "@/components/AuthModal";
import MediaGuard from "@/components/MediaGuard";
import SavoirFaire from "@/components/SavoirFaire";

// ============================================================
// RÉGLAGES DE LA BOUTIQUE (à adapter facilement)
// ============================================================
const SHIPPING_FEE = 4.9;               // frais de livraison sous le seuil (France)
const FREE_SHIPPING_THRESHOLD = 50;     // livraison offerte à partir de ce montant (après remise)
const MAX_QTY_PER_PRODUCT = 10;         // quantité max par bague (stock + fabrication sur commande)
const BACKORDER_LEAD_TIME = "5 jours";  // délai de fabrication une fois le stock épuisé
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

const formatPrice = (n) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

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
    family: row.family,
    collection: row.collection,
    energy: row.energy,
    price: Number(row.price),
    promoPrice: row.promo_price !== null && row.promo_price !== undefined ? Number(row.promo_price) : null,
    stock: typeof row.stock === "number" ? row.stock : 0,
    pitch: row.pitch || "",
    crystals: Array.isArray(row.crystals) ? row.crystals : [],
    photos,
    video: row.video || null,
    color: row.color || "from-rose-300 via-pink-100 to-white",
    stone: row.stone || "💎",
    photoCount: photos.length,
    videoCount: row.video ? 1 : 0,
  };
}

// Calcul des montants du panier (sous-total, remise, livraison, total)
function computeTotals(lines, promo) {
  const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));
  let discount = 0;
  if (promo && promo.type === "percent") discount = round2((subtotal * promo.value) / 100);
  if (promo && promo.type === "fixed") discount = Math.min(promo.value, subtotal);
  const discounted = round2(subtotal - discount);
  const freeByPromo = Boolean(promo && promo.type === "shipping");
  const qualifies = discounted >= FREE_SHIPPING_THRESHOLD;
  const shipping = lines.length === 0 ? 0 : freeByPromo || qualifies ? 0 : SHIPPING_FEE;
  const total = round2(discounted + shipping);
  const remaining = round2(Math.max(0, FREE_SHIPPING_THRESHOLD - discounted));
  return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };
}

// ============================================================
// DISPONIBILITÉ D'UNE BAGUE
// - qty <= stock      -> disponible immédiatement
// - qty > stock        -> la partie au-delà du stock est fabriquée sur
//                         commande, avec un délai de quelques jours.
// - stock === 0        -> rupture de stock, fabrication sur commande uniquement.
// ============================================================
function getAvailability(product, qty = 0) {
  const stock = typeof product.stock === "number" ? product.stock : 0;
  if (stock <= 0) {
    return { state: "backorder", stock, label: "Rupture de stock", detail: `Fabriquée sur commande · délai ${BACKORDER_LEAD_TIME}` };
  }
  if (qty > stock) {
    return {
      state: "partial-backorder",
      stock,
      label: `${stock} disponible${stock > 1 ? "s" : ""}`,
      detail: `${qty - stock} exemplaire${qty - stock > 1 ? "s" : ""} fabriqué${qty - stock > 1 ? "s" : ""} sur commande · délai ${BACKORDER_LEAD_TIME}`,
    };
  }
  return { state: "in-stock", stock, label: `${stock} disponible${stock > 1 ? "s" : ""}`, detail: "" };
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

// Thème visuel de chaque famille (le nombre de créations, lui, est calculé
// dynamiquement à partir du catalogue chargé depuis la base de données).
const ENERGY_THEMES = [
  { name: "Bleus", theme: "Sérénité et protection", icon: Shield, bg: "from-sky-100 to-indigo-200" },
  { name: "Roses", theme: "Amour et joie", icon: Heart, bg: "from-rose-100 to-pink-200" },
  { name: "Nature", theme: "Ancrage et abondance", icon: Leaf, bg: "from-emerald-100 to-amber-100" },
  { name: "Violettes", theme: "Intuition et éveil", icon: Sparkles, bg: "from-violet-100 to-purple-200" },
];

function CrystalLogo({ mode = 1, compact = false }) {
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
        <div className={`${compact ? "text-xl" : "text-3xl"} tracking-[.22em] font-serif text-[#412f3b]`}>ZENORIA</div>
        {!compact && <div className="text-[10px] tracking-wide text-[#755f6e] italic">L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</div>}
      </div>
    </div>
  );
}

// Visuel produit : utilise la vraie photo (ou la vidéo pour le Hero) si présente,
// qu'elle vienne de Supabase Storage (upload via /admin) ou de /public/images
// (anciennes collections), sinon affiche un visuel graphique de remplacement.
function RingVisual({ product, large = false, circle = false, video = false }) {
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

// Pastille de disponibilité
function AvailabilityBadge({ product, qty = 0, showDetail = false }) {
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
function PriceTag({ product, className = "" }) {
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
function ProductMedia({ product, initialMode = "video" }) {
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

export default function ZenoriaShop() {
  // --- Catalogue et codes promo, chargés depuis Supabase ---
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [promoCodes, setPromoCodes] = useState({});

  // --- Panier ---
  const [cartItems, setCartItems] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState(false);
  const [viewportH, setViewportH] = useState(800);

  const [fav, setFav] = useState([]);
  const [menu, setMenu] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedMode, setSelectedMode] = useState("video");
  const logo = 1;
  const [quiz, setQuiz] = useState(null);
  const [selectedFamily, setSelectedFamily] = useState(null);

  // --- Authentification (Supabase) ---
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Charge le catalogue + les codes promo, puis restaure le panier sauvegardé
  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: prodData, error: prodErr }, { data: promoData }] = await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("id"),
        supabase.from("promo_codes").select("*").eq("active", true),
      ]);
      if (!active) return;

      const loadedProducts = !prodErr && prodData ? prodData.map(mapDbProduct) : [];
      setProducts(loadedProducts);

      const promoMap = {};
      (promoData || []).forEach((p) => {
        promoMap[p.code] = { type: p.type, value: Number(p.value), label: p.label };
      });
      setPromoCodes(promoMap);

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
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session ? session.user : null;
      setUser(currentUser);
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
  const totals = useMemo(() => computeTotals(cartLines, promo), [cartLines, promo]);
  const progress = Math.min(100, Math.round(((totals.subtotal - totals.discount) / FREE_SHIPPING_THRESHOLD) * 100));
  const cartDensity = pickCartDensity(
    cartLines.length,
    viewportH,
    (promoOpen && !promo ? 44 : 0) + (cartNotice ? 44 : 0)
  );
  const tightFooter = cartDensity === "dense";
  const dens = CART_DENSITY[cartDensity];

  // --- Familles d'énergie, avec comptage dynamique à partir du catalogue ---
  const energies = useMemo(
    () =>
      ENERGY_THEMES.map((e) => ({
        ...e,
        count: products.filter((p) => p.family.includes(e.name)).length,
      })),
    [products]
  );

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

  const handleEnergyClick = (energyName) => {
    setSelectedFamily((prev) => (prev === energyName ? null : energyName));
    scrollToSection("collections");
  };

  const filteredProducts = selectedFamily
    ? products.filter((p) => p.family.includes(selectedFamily))
    : products;

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32] selection:bg-[#dcc8dd]">
    <MediaGuard />
      <Head>
        <title>Zenoria — L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme</title>
        <meta name="description" content="Bagues artisanales en cristaux Swarovski. Collections Bleus, Roses, Nature et Violettes." />
      </Head>

      <div className="bg-[#342434] text-white/85 text-[11px] py-2 px-4 text-center tracking-wide">
        Livraison offerte dès {FREE_SHIPPING_THRESHOLD} € · Créations artisanales en cristaux Swarovski · Paiement sécurisé
      </div>

      <header className="sticky top-0 z-40 bg-[#fbf8f4]/95 backdrop-blur border-b border-[#eadfe4]">
        <div className="max-w-7xl mx-auto px-5 h-20 flex items-center justify-between">
          <CrystalLogo compact mode={logo} />
          <nav className="hidden lg:flex gap-7 text-sm">
            <button onClick={() => scrollToSection("collections")} className="hover:text-[#8f6075]">Collections</button>
            <button onClick={() => scrollToSection("energies")} className="hover:text-[#8f6075]">Nos énergies</button>
            <button onClick={() => scrollToSection("savoir-faire")} className="hover:text-[#8f6075]">Savoir-faire</button>
            <button onClick={() => scrollToSection("philosophie")} className="hover:text-[#8f6075]">Notre histoire</button>
            <button onClick={() => scrollToSection("quiz")} className="hover:text-[#8f6075]">Quiz</button>
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
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b]"
                  >
                    <LogOut size={16} /> Se déconnecter
                  </button>
                </div>
              )}
            </div>

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
            <button onClick={() => { scrollToSection("collections"); setMenu(false); }} className="text-left">Collections</button>
            <button onClick={() => { scrollToSection("energies"); setMenu(false); }} className="text-left">Nos énergies</button>
            <button onClick={() => { scrollToSection("savoir-faire"); setMenu(false); }} className="text-left">Savoir-faire</button>
            <button onClick={() => { scrollToSection("philosophie"); setMenu(false); }} className="text-left">Notre histoire</button>
            <button onClick={() => { scrollToSection("quiz"); setMenu(false); }} className="text-left">Quiz</button>
            <button onClick={() => { scrollToSection("contact"); setMenu(false); }} className="text-left">Contact</button>
            {!authLoading && (
              user ? (
                <>
                  {isAdmin && <a href="/admin" className="text-left text-[#8f6075]">Administration</a>}
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
                {products.length > 0 ? `${products.length} collections · ` : ""}Cristaux Swarovski
              </div>
              <h1 className="font-serif text-6xl md:text-8xl leading-none mb-5 text-[#513642]">ZENORIA</h1>
              <p className="font-serif italic text-2xl md:text-3xl text-[#594856] mb-5">
                L&apos;énergie du cristal,<br />l&apos;harmonie de l&apos;âme.
              </p>
              <p className="max-w-lg text-[#6e6268] leading-7 mb-8">
                Des bagues artisanales en cristaux Swarovski, imaginées comme des symboles d&apos;équilibre et façonnées pour révéler votre lumière intérieure.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => scrollToSection("collections")}
                  className="rounded-full bg-[#8f6075] hover:bg-[#71485b] px-7 h-12"
                >
                  Découvrir la collection <ArrowRight className="ml-2" size={17} />
                </Button>
                <Button
                  onClick={() => scrollToSection("philosophie")}
                  variant="outline"
                  className="rounded-full border-[#9b7a89] px-7 h-12 bg-white/35"
                >
                  Notre philosophie
                </Button>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="relative flex justify-center">
              <div className="w-[420px] max-w-[88vw] aspect-square rounded-full bg-white/35 border border-white shadow-[0_30px_100px_rgba(91,54,77,.2)] overflow-hidden relative">
                {products[0] && <RingVisual product={products[0]} large circle video />}
              </div>
              <div className="absolute right-0 bottom-8 rounded-2xl bg-white/65 backdrop-blur p-4 shadow-lg">
                <Gem className="text-[#9b6480] mb-2" />
                <div className="font-serif">Pièce artisanale</div>
                <div className="text-xs text-[#756a70]">Cristaux Swarovski</div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ENERGIES / FAMILLES */}
        <section id="energies" className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-10">
            <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">Votre intention, votre bijou</div>
            <h2 className="font-serif text-4xl">Trouvez l&apos;énergie qui vous ressemble</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {energies.map((e) => (
              <motion.div
                whileHover={{ y: -7 }}
                key={e.name}
                onClick={() => handleEnergyClick(e.name)}
                role="button"
                tabIndex={0}
                className={`cursor-pointer rounded-[2rem] p-6 min-h-48 bg-gradient-to-br ${e.bg} border shadow-sm transition ${
                  selectedFamily === e.name ? "border-[#8f6075] ring-2 ring-[#8f6075]" : "border-white"
                }`}
              >
                <e.icon className="mb-8 text-[#725464]" />
                <div className="font-serif text-2xl mb-2">{e.name}</div>
                <div className="text-sm text-[#665c61]">{e.count} création{e.count > 1 ? "s" : ""} · {e.theme}</div>
                <ArrowRight className="mt-5" size={18} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* COLLECTIONS / CATALOGUE */}
        <section id="collections" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-between items-end mb-9">
              <div>
                <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">La collection</div>
                <h2 className="font-serif text-4xl">
                  {selectedFamily ? `Collection ${selectedFamily}` : "Nos créations"}
                </h2>
              </div>
              {selectedFamily ? (
                <button onClick={() => setSelectedFamily(null)} className="text-sm border-b border-[#6d4e5c]">
                  Voir toute la collection
                </button>
              ) : (
                <button className="text-sm border-b border-[#6d4e5c]">Voir toute la collection</button>
              )}
            </div>

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
                      <button
                        onClick={() => setFav(fav.includes(p.id) ? fav.filter((x) => x !== p.id) : [...fav, p.id])}
                        className="absolute right-4 top-4 h-10 w-10 bg-white/80 rounded-full grid place-items-center z-10"
                        aria-label="Ajouter aux favoris"
                      >
                        <Heart size={18} fill={fav.includes(p.id) ? "#9a667c" : "none"} className="text-[#9a667c]" />
                      </button>
                      <button className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition z-[5]" onClick={() => openProduct(p)} aria-label={`Voir ${p.name}`} />
                    </div>
                    <CardContent className="p-5">
                      <div className="text-xs uppercase tracking-widest text-[#9a7384]">{p.family} · {p.collection}</div>
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
        <SavoirFaire product={products[0]} />

        {/* PHILOSOPHIE */}
        <section id="philosophie" className="grid lg:grid-cols-2 min-h-[540px]">
          <div className="bg-gradient-to-br from-[#d8c4d9] via-[#f5e8e6] to-[#dbc9a9] grid place-items-center p-12">
            <div className="h-80 w-80 rounded-full border border-white/60 bg-white/30 shadow-2xl grid place-items-center">
              <CrystalLogo mode={logo} />
            </div>
          </div>
          <div className="bg-[#3b2b39] text-white p-12 lg:p-20 flex flex-col justify-center">
            <div className="text-xs tracking-[.3em] uppercase text-[#d7b4c3] mb-4">Notre philosophie</div>
            <h2 className="font-serif text-4xl md:text-5xl leading-tight mb-6">
              Plus qu&apos;un bijou,<br />un symbole d&apos;équilibre.
            </h2>
            <p className="text-white/70 leading-7 max-w-xl">
              Chaque création Zenoria associe l&apos;élégance des cristaux Swarovski à un univers de sérénité. Nos bagues sont pensées pour accompagner les instants précieux et raconter une histoire personnelle.
            </p>
            <Button variant="outline" className="mt-8 w-fit rounded-full border-white/40 bg-transparent text-white">
              Découvrir notre histoire
            </Button>
          </div>
        </section>

        {/* QUIZ */}
        <section id="quiz" className="max-w-6xl mx-auto px-6 py-24">
          <div className="rounded-[2.5rem] p-8 md:p-14 bg-gradient-to-r from-[#eee3f5] to-[#f6e3df] grid lg:grid-cols-[1.2fr_.8fr] gap-10">
            <div>
              <Sparkles className="text-[#956d83] mb-5" />
              <h2 className="font-serif text-4xl mb-4">Quelle énergie recherchez-vous aujourd&apos;hui ?</h2>
              <p className="text-[#6d6068] mb-7">Choisissez votre intention et découvrez la création Zenoria qui lui correspond.</p>
              <div className="flex flex-wrap gap-3">
                {["Sérénité", "Amour", "Protection", "Abondance", "Éveil spirituel"].map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setQuiz(x)}
                    style={{ color: quiz === x ? "#ffffff" : "#54434c" }}
                    className={`rounded-full px-5 h-10 text-sm font-medium border transition ${
                      quiz === x
                        ? "bg-[#82566d] border-[#82566d]"
                        : "bg-white border-[#d9c5cc] hover:bg-[#f5edf1]"
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-white/70 p-7 min-h-52 flex flex-col justify-center">
              {quiz ? (
                <>
                  <div className="text-xs uppercase tracking-widest text-[#9a6e82]">Votre sélection</div>
                  <div className="font-serif text-3xl my-3">{quiz}</div>
                  <p className="text-sm text-[#6b6166] mb-5">Nous avons sélectionné une création qui accompagne cette intention.</p>
                  {products.length > 0 && (
                    <Button
                      onClick={() => openProduct(products.find((p) => p.collection === quiz) || products[0])}
                      className="rounded-full bg-[#8d5e74]"
                    >
                      Voir la recommandation
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Gem className="text-[#9b6980] mb-4" size={34} />
                  <div className="font-serif text-2xl">Votre recommandation apparaîtra ici</div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* TEMOIGNAGES */}
        <section className="bg-white py-20">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className="font-serif text-4xl">Elles parlent de Zenoria</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                "Une création délicate, encore plus belle portée.",
                "Le soin du détail et l'univers de la marque m'ont séduite.",
                "Un cadeau lumineux, présenté avec beaucoup d'élégance.",
              ].map((t, i) => (
                <div key={t} className="rounded-3xl bg-[#fbf7f5] p-7">
                  <div className="flex mb-4">
                    {[1, 2, 3, 4, 5].map((x) => (
                      <Star key={x} size={16} fill="#b88966" className="text-[#b88966]" />
                    ))}
                  </div>
                  <p className="font-serif text-xl italic">&ldquo;{t}&rdquo;</p>
                  <div className="mt-5 text-xs uppercase tracking-widest text-[#8b737e]">Cliente Zenoria {i + 1}</div>
                </div>
              ))}
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
            <CrystalLogo compact mode={logo} />
            <p className="text-xs mt-5 leading-6">L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</p>
          </div>
          <div>
            <div className="text-white mb-3">Boutique</div>
            <div className="text-sm space-y-2">
              <p>Collections</p>
              <p>Nouveautés</p>
              <p>Éditions limitées</p>
            </div>
          </div>
          <div>
            <div className="text-white mb-3">Informations</div>
            <div className="text-sm space-y-2">
              <p>Livraison et retours</p>
              <p>FAQ</p>
              <p>Mentions légales</p>
            </div>
          </div>
          <div>
            <div className="text-white mb-3">Suivez-nous</div>
            <div className="flex gap-3">
              <Instagram />
              <Heart />
              <Sparkles />
            </div>
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
                    <p className="text-sm text-[#756a70] mb-6">Découvrez nos créations et laissez-vous guider par votre énergie.</p>
                    <button
                      onClick={() => { setCartOpen(false); scrollToSection("collections"); }}
                      className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm"
                    >
                      Continuer mes achats
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-none px-5 pt-3 pb-2">
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
                      Livraison offerte dès {FREE_SHIPPING_THRESHOLD} € en France
                    </div>
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

                    <button
                      onClick={() => setCheckoutNotice(true)}
                      className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition ${tightFooter ? "h-11" : "h-12"}`}
                    >
                      Commander
                    </button>
                    {checkoutNotice ? (
                      <p className="text-[11px] text-center rounded-lg bg-[#f5edf1] text-[#6b4a5b] px-3 py-1.5">
                        Le paiement en ligne sera ajouté à la prochaine étape. Aucune transaction n&apos;est possible pour le moment.
                      </p>
                    ) : (
                      <p className="text-[11px] text-center text-[#7e7378]">Paiement de démonstration, aucune transaction réelle.</p>
                    )}
                  </div>
                </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* FICHE PRODUIT */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setSelected(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed z-50 inset-x-4 top-[6%] max-w-4xl mx-auto bg-[#fbf8f4] rounded-[2rem] overflow-hidden shadow-2xl grid md:grid-cols-2 max-h-[88vh] overflow-y-auto"
            >
              <ProductMedia product={selected} initialMode={selectedMode} />
              <div className="p-8 relative">
                <button className="absolute right-5 top-5" onClick={() => setSelected(null)} aria-label="Fermer"><X /></button>
                <div className="text-xs uppercase tracking-widest text-[#9a7384]">{selected.family} · {selected.collection}</div>
                <h3 className="font-serif text-4xl mt-3">{selected.name}</h3>
                <PriceTag product={selected} className="text-2xl mt-4 block" />
                <div className="mt-3">
                  <AvailabilityBadge product={selected} showDetail />
                </div>

                {selected.pitch && (
                  <p className="text-[15px] leading-7 text-[#54434c] mt-5">{selected.pitch}</p>
                )}
                <p className="text-sm leading-6 text-[#70656a] mt-3 italic">{selected.energy}</p>

                {selected.crystals && selected.crystals.length > 0 && (
                  <div className="mt-6">
                    <div className="text-xs uppercase tracking-widest mb-2">Composition</div>
                    <p className="text-sm text-[#70656a] mb-3">
                      {selected.crystals.reduce((s, c) => s + c.count, 0)} cristaux Swarovski en {selected.crystals.length} couleur{selected.crystals.length > 1 ? "s" : ""}
                    </p>
                    <ul className="space-y-1.5">
                      {selected.crystals.map((c) => (
                        <li key={c.color} className="flex items-center gap-3 text-sm text-[#54434c]">
                          <span
                            className="h-4 w-4 rounded-full border border-black/10"
                            style={{ background: c.hex || "#e9dde3" }}
                          />
                          <span>{c.count} × {c.color}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={() => { addToCart(selected); setSelected(null); }}
                  className="w-full mt-7 rounded-full h-12 bg-[#855a6f] hover:bg-[#6f4a5c] text-white text-sm font-medium transition"
                >
                  Ajouter au panier
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AUTHENTIFICATION */}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
