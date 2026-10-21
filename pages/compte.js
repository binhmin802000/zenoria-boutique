// ZENORIA_ACCOUNT_STEP11_V1 · ZENORIA_ACCOUNT_STEP12_V1 · ZENORIA_ACCOUNT_HERO_B_V1 · ZENORIA_ACCOUNT_STEP13_V1
import React, { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut, Truck, RotateCw, ChevronLeft } from "lucide-react";
import { supabase, getMediaUrl, SITE_MEDIA_TABLE, SITE_SLOT_ACCOUNT_HERO } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { fetchReviewsSetting, DEFAULT_REVIEWS } from "@/lib/reviewsSettings";
import { CONTACT_KEY, DEFAULT_CONTACT, parseContactSetting, buildMailtoLink, buildWhatsAppLink, buildSignalLink } from "@/lib/contactSettings";
import { CUSTOMER_VISIBLE_STATUSES, TRACKING_STEPS, orderStatusInfo, formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay";

// ============================================================
// PAGE « MON COMPTE » — /compte (espace cliente)
//
// Page affichée côté navigateur (la session Supabase vit dans le navigateur), non indexée.
// Non connectée ou session expirée : retour à l'accueil avec la fenêtre de connexion ouverte
// (/?connexion=compte), puis retour automatique ici après la connexion (pages/index.js).
// Rubriques accessibles par adresse directe : /compte#accueil, #commandes, #avis, #favoris, #profil, #donnees.
// « Mes avis » : visible si l'interrupteur des avis est sur ON, ou pour l'administration.
// Bandeau : image de l'emplacement « account_hero » (Admin › Contenu du site), sinon image par défaut
// public/images/compte-fondu-lumineux.jpg. Rendu validé « Ivoire champagne » (étape 1.2).
//
// Étape 1.3 — Accueil et Mes commandes :
//  - seules les commandes payées, expédiées ou livrées sont affichées (CUSTOMER_VISIBLE_STATUSES) ;
//  - le prix de chaque bijou est celui réellement payé (order_items.product_price), jamais le prix
//    actuel du catalogue ;
//  - le suivi (Payée/Expédiée/Livrée) est daté depuis order_status_history ;
//  - « Commander à nouveau » ajoute au panier EXISTANT (sans le vider) les bijoux encore en vente,
//    signale ceux qui ne le sont plus, puis propose d'aller voir le panier (/?panier=compte, géré par
//    pages/index.js qui ouvre alors le panier automatiquement) ;
//  - « Une question sur cette commande ? » réutilise les canaux de contact réglés dans l'admin, avec
//    la référence ZEN glissée dans le message (e-mail et WhatsApp la pré-remplissent ; pour Signal,
//    qui ne permet pas de préremplir, le message est à copier) ;
//  - clé du panier (CART_STORAGE_KEY) et quantité maximale par bijou (MAX_QTY_PER_PRODUCT) dupliquées
//    volontairement depuis pages/index.js, faute d'un lib partagé : à garder synchronisées si l'une
//    des deux valeurs change un jour (voir vigilance de l'état des lieux sur les listes dupliquées).
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
const MAX_QTY_PER_PRODUCT = 10; // doit rester identique à pages/index.js
const TIME_ZONE = "Europe/Paris";

function readHash() {
  if (typeof window === "undefined") return "accueil";
  const h = window.location.hash.replace("#", "");
  return SECTIONS.some((s) => s.id === h) ? h : "accueil";
}
function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE });
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
  if (contactCfg.email.enabled && contactCfg.email.value) {
    channels.push({ id: "email", label: "Par e-mail", href: buildMailtoLink(contactCfg.email.value, subject, mailBody) });
  }
  if (contactCfg.whatsapp.enabled && contactCfg.whatsapp.value) {
    channels.push({ id: "whatsapp", label: "WhatsApp", href: buildWhatsAppLink(contactCfg.whatsapp.value, waText) });
  }
  if (contactCfg.signal.enabled && contactCfg.signal.value) {
    channels.push({ id: "signal", label: "Signal", href: buildSignalLink(contactCfg.signal.value) });
  }
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

function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onReorder, reorderBusy, reorderMsg }) {
  const info = orderStatusInfo(order.status);
  const total = Number(order.total) || 0;
  return (
    <div data-testid={`order-detail-${order.id}`}>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-[#8f6075] mb-3">
        <ChevronLeft size={16} /> Toutes mes commandes
      </button>
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="font-serif text-2xl text-[#412f3b]">Commande {order.reference}</h2>
        <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${info.className}`}>{info.label}</span>
      </div>
      <p className="text-xs text-[#8b737e] mt-1">Passée le {formatDate(order.created_at)}</p>

      <div className="mt-5"><Timeline order={order} /></div>

      {order.carrier && (
        <div className="mt-4 rounded-xl bg-[#fbf7f9] px-4 py-3 flex items-center gap-2 text-sm text-[#54434c]">
          <Truck size={16} className="text-[#8f6075]" /> {order.carrier}
          {order.tracking_number && <span className="text-[#8b737e]">· suivi {order.tracking_number}</span>}
        </div>
      )}

      <h3 className="font-serif text-lg text-[#412f3b] mt-6 mb-2">Bijoux</h3>
      <div className="space-y-2">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#eee2e5] p-2.5">
            <ProductThumb item={it} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[#412f3b] truncate">{it.product_name}</div>
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
          <div className="flex justify-between pt-1.5 mt-1 border-t border-[#eadfe4] font-medium text-[#412f3b]"><span>Total payé</span><span>{formatOrderPrice(total)}</span></div>
        </div>
      </div>

      {reorderMsg && <div className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{reorderMsg}</div>}

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={() => onReorder(order)} disabled={reorderBusy} data-testid="reorder-btn" className="flex items-center gap-2 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm disabled:opacity-50">
          <RotateCw size={15} /> Commander à nouveau
        </button>
        <button type="button" onClick={() => setQuestionOpen(questionOpen ? null : order.id)} className="rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1]">
          Une question sur cette commande ?
        </button>
      </div>
      {questionOpen === order.id && <QuestionPanel order={order} contactCfg={contactCfg} onClose={() => setQuestionOpen(null)} />}
    </div>
  );
}

export default function Compte() {
  const [user, setUser] = useState(undefined); // undefined : vérification en cours ; null : non connectée
  const [isAdmin, setIsAdmin] = useState(false);
  const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS);
  const [section, setSection] = useState("accueil");
  const [heroUrl, setHeroUrl] = useState(DEFAULT_HERO);

  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [contactCfg, setContactCfg] = useState(DEFAULT_CONTACT);
  const [questionOpenId, setQuestionOpenId] = useState(null);
  const [reorderBusyId, setReorderBusyId] = useState(null);
  const [reorderMsg, setReorderMsg] = useState("");
  const [reviewableCount, setReviewableCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);

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
      const [adm, cfg, hero] = await Promise.all([
        supabase.from("admin_users").select("user_id").eq("user_id", u.id).maybeSingle(),
        fetchReviewsSetting(supabase),
        supabase.from(SITE_MEDIA_TABLE).select("path").eq("slot", SITE_SLOT_ACCOUNT_HERO).maybeSingle(),
      ]);
      if (!alive) return;
      setIsAdmin(Boolean(adm && !adm.error && adm.data));
      setReviewsCfg(cfg);
      if (hero && !hero.error && hero.data && hero.data.path) setHeroUrl(getMediaUrl(hero.data.path, "site"));
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

  // Commandes, canaux de contact, favoris et bijoux à évaluer : chargés une fois la cliente connue
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    (async () => {
      setOrdersLoading(true);
      const [ordersRes, contactRes, favRes, reviewRes] = await Promise.all([
        supabase.from("orders").select("*").in("status", CUSTOMER_VISIBLE_STATUSES).order("created_at", { ascending: false }),
        supabase.from(SITE_SETTINGS_TABLE).select("value").eq("key", CONTACT_KEY).maybeSingle(),
        supabase.from("customer_favorites").select("product_id", { count: "exact", head: true }),
        supabase.rpc("list_reviewable_items"),
      ]);
      if (!alive) return;
      setContactCfg(parseContactSetting(contactRes && !contactRes.error && contactRes.data ? contactRes.data.value : null));
      setFavoritesCount((favRes && typeof favRes.count === "number") ? favRes.count : 0);
      const reviewable = (reviewRes && !reviewRes.error && reviewRes.data) || [];
      setReviewableCount(reviewable.filter((r) => r.can_review).length);

      const list = (ordersRes && !ordersRes.error && ordersRes.data) || [];
      if (list.length === 0) {
        setOrders([]);
        setOrdersLoading(false);
        return;
      }
      const ids = list.map((o) => o.id);
      const [itemsRes, historyRes] = await Promise.all([
        supabase.from("order_items").select("order_id, product_id, product_name, product_price, qty").in("order_id", ids),
        supabase.from("order_status_history").select("order_id, status, changed_at").in("order_id", ids).in("status", ["paid", "shipped", "delivered"]),
      ]);
      if (!alive) return;
      const items = (itemsRes && !itemsRes.error && itemsRes.data) || [];
      const history = (historyRes && !historyRes.error && historyRes.data) || [];
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
        history.filter((h) => h.order_id === o.id).forEach((h) => { steps[h.status] = h.changed_at; });
        return { ...o, reference: formatOrderReference(o), items: oItems, steps };
      });
      setOrders(enriched);
      setOrdersLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const showReviews = Boolean(reviewsCfg.enabled || isAdmin);
  const visible = SECTIONS.filter((s) => !s.reviews || showReviews);
  const current = visible.find((s) => s.id === section) || visible[0];

  const go = (id) => {
    window.history.replaceState(null, "", "#" + id);
    setSection(id);
    setSelectedOrderId(null);
    setQuestionOpenId(null);
    setReorderMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.replace("/");
  };

  const reorder = (order) => {
    setReorderBusyId(order.id);
    setReorderMsg("");
    try {
      let cart = { items: [], promo: null };
      try {
        const raw = window.localStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          cart = { items: Array.isArray(saved.items) ? saved.items.slice() : [], promo: saved.promo || null };
        }
      } catch (e) {
        // panier illisible : on repart d'un panier vide, sans bloquer la cliente
      }
      let added = 0;
      let unavailable = 0;
      order.items.forEach((it) => {
        if (!it.product_id || !it.product || !it.product.active) {
          unavailable += 1;
          return;
        }
        const existing = cart.items.find((c) => c.id === it.product_id);
        const qty = Math.min(MAX_QTY_PER_PRODUCT, (existing ? existing.qty : 0) + (Number(it.qty) || 1));
        if (existing) existing.qty = qty;
        else cart.items.push({ id: it.product_id, qty });
        added += 1;
      });
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      if (added === 0) setReorderMsg("Ces bijoux ne sont plus en vente pour le moment.");
      else setReorderMsg(unavailable > 0 ? `${added} bijou(x) ajouté(s) au panier. ${unavailable} bijou(x) n'est/ne sont plus en vente.` : `${added} bijou(x) ajouté(s) au panier.`);
    } catch (e) {
      setReorderMsg("Impossible d'ajouter ces bijoux au panier pour le moment.");
    }
    setReorderBusyId(null);
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;
  const lastOrder = orders[0] || null;

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Mon compte — Zenoria</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-[.22em] text-[#412f3b]">ZENORIA</a>
          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>
        </div>
      </header>

      {!user ? (
        <main className="max-w-6xl mx-auto px-6 py-24 text-center text-sm text-[#8b737e]" data-testid="account-loading">
          {user === null ? "Redirection vers la connexion…" : "Chargement de votre espace…"}
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8" data-testid="account-page">
          {/* BANDEAU D'ACCUEIL (ZENORIA_ACCOUNT_HERO_B_V1) — rendu validé « Proposition B · Ivoire champagne ».
              Photo entière calée à droite ; zone du bijou intacte ; fondu progressif vers la gauche ;
              fond champagne + halo chaud ; voile limité à la zone du texte.
              Image modifiable dans Admin › Contenu du site (emplacement account_hero) :
              cadrer le bijou dans la moitié droite de l'image pour conserver cet effet. */}
          <section
            data-testid="account-hero"
            className="relative rounded-[1.5rem] overflow-hidden h-[220px] sm:h-[240px] flex items-center mb-6 border border-[#efe2d6]"
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
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden sm:block"
              style={{ background: "linear-gradient(90deg, rgba(252,247,240,.6) 0%, rgba(250,243,234,.5) 22%, rgba(249,240,229,.18) 38%, rgba(249,240,229,0) 48%)" }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 sm:hidden"
              style={{ background: "linear-gradient(90deg, rgba(252,247,240,.75) 0%, rgba(250,243,234,.55) 34%, rgba(249,240,229,.15) 50%, rgba(249,240,229,0) 58%)" }}
            />

            <div className="relative pl-5 pr-3 sm:px-14 max-w-[56%] sm:max-w-md">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[.28em] text-[#b48a5a]">Mon compte</p>
              <h1 className="font-serif text-3xl sm:text-5xl text-[#4a3743] mt-1.5 leading-tight">Bonjour</h1>
              <span aria-hidden="true" className="block h-px w-12 sm:w-14 mt-2.5 mb-2" style={{ background: "linear-gradient(90deg, #c9a679, rgba(201,166,121,0))" }} />
              <p className="text-[11px] sm:text-sm text-[#705e68] truncate" title={user.email}>{user.email}</p>
            </div>
          </section>

          <div className="grid lg:grid-cols-[230px_1fr] gap-6">
            {/* MENU : à gauche sur ordinateur, onglets défilants sur mobile */}
            <nav aria-label="Rubriques de mon compte" className="lg:self-start lg:sticky lg:top-4">
              <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible rounded-full lg:rounded-2xl bg-white border border-[#eadfe4] p-1.5 lg:p-2.5">
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
            <section data-testid={`account-section-${current ? current.id : "accueil"}`} className="rounded-2xl bg-white border border-[#eadfe4] p-6 min-h-[260px]">
              {current && current.id === "accueil" && (
                <div data-testid="section-accueil">
                  <h2 className="font-serif text-2xl text-[#412f3b] mb-4">Accueil</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                    <button type="button" onClick={() => go("commandes")} className="text-left rounded-2xl border border-[#eee2e5] p-4 hover:border-[#d9c5cc]">
                      <div className="font-serif text-2xl text-[#412f3b]">{ordersLoading ? "…" : orders.length}</div>
                      <div className="text-xs text-[#8b737e]">commande{orders.length > 1 ? "s" : ""}</div>
                    </button>
                    {showReviews && (
                      <button type="button" onClick={() => go("avis")} className="text-left rounded-2xl border border-[#eee2e5] p-4 hover:border-[#d9c5cc]">
                        <div className="font-serif text-2xl text-[#412f3b]">{reviewableCount}</div>
                        <div className="text-xs text-[#8b737e]">bijou{reviewableCount > 1 ? "x" : ""} à évaluer</div>
                      </button>
                    )}
                    <button type="button" onClick={() => go("favoris")} className="text-left rounded-2xl border border-[#eee2e5] p-4 hover:border-[#d9c5cc]">
                      <div className="font-serif text-2xl text-[#412f3b]">{favoritesCount}</div>
                      <div className="text-xs text-[#8b737e]">favori{favoritesCount > 1 ? "s" : ""}</div>
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
                      onReorder={reorder}
                      reorderBusy={reorderBusyId === selectedOrder.id}
                      reorderMsg={reorderMsg}
                    />
                  ) : (
                    <>
                      <h2 className="font-serif text-2xl text-[#412f3b] mb-1">Mes commandes</h2>
                      <p className="text-xs text-[#8b737e] mb-4">Les commandes payées, expédiées ou livrées apparaissent ici.</p>
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
                              <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${orderStatusInfo(o.status).className}`}>{orderStatusInfo(o.status).label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {current && !["accueil", "commandes"].includes(current.id) && (
                <>
                  <h2 className="font-serif text-2xl text-[#412f3b]">{current.label}</h2>
                  <p className="text-sm text-[#8b737e] mt-2">
                    Cette rubrique sera bientôt disponible.
                    {isAdmin && <span className="block text-[11px] mt-1">(Admin : contenu prévu à l&apos;étape {current.step} de la feuille de route.)</span>}
                  </p>
                </>
              )}

              <button
                type="button"
                onClick={logout}
                className="lg:hidden mt-8 inline-flex items-center gap-2 text-sm text-[#8b737e] underline"
              >
                <LogOut size={15} /> Se déconnecter
              </button>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
