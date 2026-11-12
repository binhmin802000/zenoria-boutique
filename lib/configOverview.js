// ZENORIA_CONFIG_C1_V1 : état de configuration du site, en LECTURE SEULE (Accueil › Configuration).
// Les réglages sont lus dans site_settings (une clé, une valeur JSON). Rien n'est écrit ici : chaque réglage se modifie
// sur son écran habituel. Un réglage absent ou illisible s'affiche « Non défini » : on n'invente jamais de valeur.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseSeasonFxSetting, FX_SEASON_NAMES } from "@/lib/siteSettings";
import { parseBillingSetting, billingMissingFields } from "@/lib/billingSettings"; // ZENORIA_CONFIG_C3C_V1
import { isTransferReady } from "@/lib/paymentSettings"; // ZENORIA_CONFIG_C3B_V1
import { gridOrderOverviewItems } from "@/lib/gridOrderOverview"; // ZENORIA_CONFIG_R4_V1
import { newBadgeOverviewItems } from "@/lib/newBadgeOverview"; // ZENORIA_NEW_BADGE_V3
import { accountNewsCacheOverviewItems } from "@/lib/accountNewsCacheOverview"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1
import { careInfoOverviewItems } from "@/lib/careInfoOverview"; // ZENORIA_CARE_INFO_V1

// Réglages dont on lit la valeur
export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact", "grid_order", "newsletter", "new_badge", "account_news_cache", "care_info"]; // ZENORIA_CARE_INFO_V1
// Textes volumineux : seule la date de dernière modification est lue
export const CONFIG_META_KEYS = ["site_texts", "cgv_text"];

function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function flag(v) {
  return v === true ? true : v === false ? false : null;
}
function str(v) {
  return typeof v === "string" ? v.trim() : "";
}
function int(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function plural(n) {
  return n + (n > 1 ? " jours" : " jour");
}

export function formatMoney(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
export function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
}
// L'IBAN est affiché partiellement : début et fin seulement (il se lit en entier dans Moyens de paiement)
export function maskIban(value) {
  const compact = str(value).replace(/\s+/g, "");
  if (!compact) return "";
  if (compact.length <= 8) return compact;
  return compact.slice(0, 4) + " •••• " + compact.slice(-4);
}

// ZENORIA_CONFIG_C1B_V1 : cible d'un lien « Modifier › » vers « Contenu du site » (section d'accordéon à ouvrir et à rejoindre).
// Lue une seule fois à l'ouverture de AdminSiteMedia, comme le filtre transmis de l'Accueil vers Commandes.
export const SITE_MEDIA_GROUPS = ["vitrine", "textes-legal", "vente-livraison", "contact"];
let siteMediaTarget = null;
// ZENORIA_CONFIG_LINKS_V1 : cartes de « Vitrine & ambiance » qu'un lien de Configuration peut viser directement (repere data-config-card).
export const SITE_MEDIA_CARDS = ["grid_order", "new_badge", "account_news_cache", "care_info"]; // ZENORIA_CARE_INFO_V1
let siteMediaCard = null;
export function setSiteMediaTarget(id, card) {
  siteMediaTarget = SITE_MEDIA_GROUPS.includes(id) ? id : null;
  siteMediaCard = siteMediaTarget && SITE_MEDIA_CARDS.includes(card) ? card : null; // ZENORIA_CONFIG_LINKS_V1
}
export function peekSiteMediaCard() {
  return siteMediaCard;
}
export function peekSiteMediaTarget() {
  return siteMediaTarget;
}
export function clearSiteMediaTarget() {
  siteMediaTarget = null;
  siteMediaCard = null; // ZENORIA_CONFIG_LINKS_V1
}

const RING_MODES = { once: "Une fois" };
const RING_SPEEDS = { slow: "lente" };
const RING_HEART = { ring: "couleur de la bague" };
const REVIEW_MODES = { full: "Complet (notes et textes)", stars: "Étoiles seules" };

// Construit les cartes à afficher. Entrées :
//   rows        : { clé: { value, updated_at, ... } }  (site_settings)
//   meta        : { clé: { updated_at } } pour site_texts et cgv_text, ou null si la lecture a échoué
//   maintenance : { loading, error, row, active }      (hook useMaintenanceStatus de pages/admin.js)
// Chaque ligne : { id, label, sub?, flag? (true | false | null) ou text, tone?, missing? }
export function buildConfigOverview(input) {
  const rows = (input && input.rows) || {};
  const meta = input ? input.meta : null;
  const mt = (input && input.maintenance) || {};
  const val = (key) => (rows[key] ? obj(rows[key].value) : null);

  const pm = val("payment_methods");
  const bt = val("bank_transfer");
  const bl = val("billing");
  const sh = val("shipping");
  const ra = val("ring_animation");
  const rv = val("reviews");
  const ct = val("contact");
  const nl = val("newsletter"); // ZENORIA_NEWSLETTER_V1

  const textItem = (id, label, value, opts) => {
    const o = opts || {};
    const t = typeof value === "string" ? value : "";
    if (t) return { id, label, text: t, sub: o.sub, tone: o.tone, missing: false };
    if (o.dash) return { id, label, text: "—", sub: o.sub, missing: false };
    return { id, label, text: "Non défini", sub: o.sub, missing: true };
  };

  // ---- Paiement ----
  const delay = bt ? int(bt.delay_days) : null;
  const grace = bt ? int(bt.grace_days) : null;
  const delaysText = bt ? (delay === null ? "délai non défini" : plural(delay)) + " / " + (grace === null ? "2 jours (défaut)" : plural(grace)) : "";
  // ZENORIA_CONFIG_C3B_V1 : Stripe et Virement sont des réglages sensibles (confirmation "BINHEMI" requise).
  const transferReady = bt ? isTransferReady(bt) : false;
  const payment = [
    {
      id: "stripe",
      label: "Carte bancaire (Stripe)",
      flag: pm ? flag(pm.stripe_enabled) : null,
      sensitive: true,
      warningText:
        pm && pm.transfer_enabled === false
          ? "Le virement est déjà désactivé : désactiver Stripe laissera les clientes sans moyen de paiement."
          : undefined,
    },
    {
      id: "transfer",
      label: "Virement bancaire",
      flag: pm ? flag(pm.transfer_enabled) : null,
      sensitive: true,
      warningText: !transferReady
        ? "Le bénéficiaire et un IBAN valide doivent déjà être enregistrés dans Moyens de paiement pour pouvoir activer le virement."
        : undefined,
    },
    textItem("delays", "Délai de paiement / de grâce", delaysText),
    textItem("beneficiary", "Bénéficiaire", bt ? str(bt.beneficiary) : ""),
    textItem("iban", "IBAN (partiel)", bt ? maskIban(bt.iban) : "", {}),
  ];

  // ---- Facturation ----
  const vatRate = bl ? int(bl.vat_rate) : null;
  // ZENORIA_CONFIG_C3C_V1 : la TVA est un reglage sensible (confirmation "BINHEMI"), avertissement selon le sens du changement
  const vatIsOn = bl ? bl.vat_enabled === true : false;
  const vatMissing = bl ? billingMissingFields({ ...parseBillingSetting(bl), vat_enabled: true }) : [];
  const vatWarning = !bl
    ? undefined
    : vatIsOn
    ? "Les factures déjà émises ne seront pas modifiées. Les nouvelles factures seront émises sans TVA (mention « TVA non applicable, art. 293 B du CGI »)."
    : "Les factures déjà émises ne seront pas modifiées. Les nouvelles factures indiqueront une TVA de " + (vatRate === null ? "le taux enregistré" : vatRate + " %") + " incluse dans les prix affichés (les prix ne changent pas)." +
      (vatMissing.length ? " À compléter avant activation dans Facturation et TVA : " + vatMissing.join(", ") + "." : "");
  const billing = [
    { id: "vat", label: "Assujettie à la TVA", flag: bl ? flag(bl.vat_enabled) : null, sensitive: true, warningText: vatWarning, sub: vatRate === null ? undefined : "Taux enregistré : " + vatRate + " %" },
    textItem("seller_name", "Nom du vendeur", bl ? str(bl.seller_name) : ""),
    textItem("siret", "SIRET", bl ? str(bl.seller_siret) : ""),
    textItem("address", "Adresse", bl ? str(bl.seller_address) : ""),
    textItem("vat_number", "N° de TVA intracommunautaire", bl ? str(bl.seller_vat_number) : "", { dash: true }),
  ];

  // ---- Livraison ----
  const threshold = sh ? int(sh.threshold) : null;
  const fee = sh ? int(sh.fee) : null;
  const shipping = [
    { id: "free_shipping", label: "Livraison offerte", flag: sh ? flag(sh.enabled) : null, sub: "À partir du seuil, avant code promo" },
    { id: "threshold", label: "Seuil", text: threshold === null ? "Non défini" : formatMoney(threshold), missing: threshold === null },
    { id: "fee", label: "Frais de livraison", text: fee === null ? "Non défini" : formatMoney(fee), missing: fee === null },
  ];

  // ---- Animations ----
  const seasonRow = rows.season_fx ? rows.season_fx.value : null;
  const season = parseSeasonFxSetting(seasonRow);
  const seasonText = !rows.season_fx
    ? "Automatique (par défaut)"
    : season.mode === "off"
    ? "Désactivé"
    : season.mode === "forced"
    ? "Saison forcée : " + (FX_SEASON_NAMES[season.season] || season.season)
    : "Automatique";
  let ringText = "";
  if (ra) {
    const parts = [];
    if (str(ra.mode)) parts.push(RING_MODES[ra.mode] || str(ra.mode));
    if (str(ra.speed)) parts.push("vitesse " + (RING_SPEEDS[ra.speed] || str(ra.speed)));
    if (str(ra.heart_color)) parts.push("cœur : " + (RING_HEART[ra.heart_color] || str(ra.heart_color)));
    ringText = parts.join(" · ");
  }
  const animations = [
    { id: "season_fx", label: "Effet saisonnier", text: seasonText, sub: "Désactivé pour les visiteuses qui limitent les mouvements", missing: false },
    textItem("ring", "Animation « Le geste »", ringText),
  ];

  // ---- Ordre des bijoux ---- ZENORIA_CONFIG_R4_V1
  // Reglage absent : le site applique son reglage par defaut (aleatoire, chaque jour), affiche « (par defaut) » et non « Non defini ».
  const gridOrderItems = gridOrderOverviewItems(rows.grid_order || null, formatWhen);
  const newBadgeItems = newBadgeOverviewItems(rows.new_badge || null); // ZENORIA_NEW_BADGE_V3
  const accountNewsCacheItems = accountNewsCacheOverviewItems(rows.account_news_cache || null); // ZENORIA_ACCOUNT_NEWS_BADGE_V1
  const careInfoItems = careInfoOverviewItems(rows.care_info || null); // ZENORIA_CARE_INFO_V1

  // ---- Avis ----
  const reviews = [
    { id: "reviews_enabled", label: "Module avis", flag: rv ? flag(rv.enabled) : null, sub: "Dépôt, affichage, charte des avis" },
    textItem("reviews_mode", "Affichage", rv ? REVIEW_MODES[rv.mode] || str(rv.mode) : ""),
  ];

  // ---- Newsletter ---- ZENORIA_NEWSLETTER_V1
  const newsletter = [
    { id: "newsletter_enabled", label: "Section « Le cercle Zenoria »", flag: nl ? flag(nl.enabled) : null, sub: "Bloc d'inscription en bas de l'accueil (collecte non encore active)" },
  ];

  // ---- Contact ----
  const channel = (key, label) => {
    const c = ct ? obj(ct[key]) : null;
    const value = c ? str(c.value) : "";
    return { id: "contact_" + key, label, flag: c ? flag(c.enabled) : null, sub: value || undefined };
  };
  const contact = [channel("email", "E-mail"), channel("whatsapp", "WhatsApp"), channel("signal", "Signal")];

  // ---- Maintenance ----
  let mText = "Non défini";
  let mTone = "";
  let mSub = "";
  let mMissing = false;
  if (mt.loading) {
    mText = "Chargement…";
    mMissing = true;
  } else if (mt.error) {
    mText = "Non lisible";
    mTone = "warn";
  } else if (!mt.row) {
    mMissing = true;
  } else if (!mt.active) {
    mText = "Ouvert";
    mTone = "ok";
  } else {
    mText = mt.row.mode === "full" ? "Maintenance totale" : "Boutique en pause";
    mTone = mt.row.mode === "full" ? "crit" : "warn";
    mSub = mt.row.auto_end_at ? "Réouverture automatique le " + formatWhen(mt.row.auto_end_at) : "Réouverture manuelle";
  }
  const maintenance = [{ id: "maintenance_state", label: "État du site", text: mText, tone: mTone, sub: mSub || undefined, missing: mMissing }];

  // ---- Contenus ----
  const metaLine = (key, emptyText) => {
    if (meta === null || meta === undefined) return { text: "Non lisible", tone: "warn", missing: false };
    const row = meta[key];
    if (!row) return { text: emptyText, missing: false };
    return { text: "Modifié le " + formatWhen(row.updated_at), missing: false };
  };
  const mTexts = metaLine("site_texts", "Valeurs par défaut");
  const mCgv = metaLine("cgv_text", "Aucun texte enregistré");
  const contents = [
    { id: "site_texts", label: "Textes du site", ...mTexts },
    { id: "cgv_text", label: "CGV", ...mCgv },
  ];

  return [
    { id: "payment", title: "Paiement", keys: "payment_methods · bank_transfer", link: { group: "reglages", tab: "paiement" }, items: payment },
    { id: "billing", title: "Facturation et TVA", keys: "billing — chaque facture est figée à son émission", link: { group: "reglages", tab: "facturation" }, items: billing },
    { id: "shipping", title: "Livraison", keys: "shipping", link: { group: "produits", tab: "site", anchor: "vente-livraison", where: "Contenu du site › Vente & livraison" }, items: shipping },
    { id: "animations", title: "Animations", keys: "season_fx · ring_animation", link: { group: "produits", tab: "site", anchor: "vitrine", where: "Contenu du site › Vitrine & ambiance" }, items: animations },
    { id: "grid_order", title: "Ordre des bijoux", keys: "grid_order", link: { group: "produits", tab: "site", anchor: "vitrine", card: "grid_order", where: "Contenu du site › Vitrine & ambiance › Ordre des bijoux" }, items: gridOrderItems },
    { id: "new_badge", title: "Badge Nouveauté", keys: "new_badge", link: { group: "produits", tab: "site", anchor: "vitrine", card: "new_badge", where: "Contenu du site › Vitrine & ambiance › Badge Nouveauté" }, items: newBadgeItems }, // ZENORIA_NEW_BADGE_V3
    { id: "account_news_cache", title: "Pastille de nouveautés (autres pages)", keys: "account_news_cache", link: { group: "produits", tab: "site", anchor: "vitrine", card: "account_news_cache", where: "Contenu du site › Vitrine & ambiance › Pastille de nouveautés sur toutes les pages" }, items: accountNewsCacheItems }, // ZENORIA_ACCOUNT_NEWS_BADGE_V1
    { id: "care_info", title: "Entretien du bijou", keys: "care_info", link: { group: "produits", tab: "site", anchor: "vitrine", card: "care_info", where: "Contenu du site › Vitrine & ambiance › Entretien du bijou" }, items: careInfoItems }, // ZENORIA_CARE_INFO_V1
    { id: "reviews", title: "Avis clientes", keys: "reviews", link: { group: "produits", tab: "site", anchor: "textes-legal", where: "Contenu du site › Textes & légal" }, items: reviews },
    { id: "newsletter", title: "Newsletter", keys: "newsletter", link: null, items: newsletter }, // ZENORIA_NEWSLETTER_V1
    { id: "contact", title: "Canaux de contact", keys: "contact", link: { group: "produits", tab: "site", anchor: "contact", where: "Contenu du site › Contact" }, items: contact },
    { id: "maintenance", title: "Maintenance", keys: "table site_maintenance", link: { group: "technique", tab: "maintenance" }, items: maintenance },
    { id: "contents", title: "Contenus", keys: "site_texts · cgv_text", link: { group: "produits", tab: "site", anchor: "textes-legal", where: "Contenu du site › Textes & légal" }, items: contents },
  ];
}

function friendly(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  return "Les réglages n'ont pas pu être lus" + (msg ? " (" + msg + ")" : "") + ". Cliquez sur « Actualiser ».";
}

// Lit les réglages. Une erreur sur la lecture principale est bloquante ; une erreur sur les dates des textes ne l'est pas.
export async function loadSiteConfig() {
  try {
    const [a, b] = await Promise.all([
      supabase.from("site_settings").select("key, value, updated_at, updated_by_email").in("key", CONFIG_KEYS),
      supabase.from("site_settings").select("key, updated_at").in("key", CONFIG_META_KEYS),
    ]);
    if (a.error || !Array.isArray(a.data)) return { rows: {}, meta: null, error: friendly(a.error) };
    const rows = {};
    a.data.forEach((r) => {
      rows[r.key] = r;
    });
    let meta = null;
    if (!b.error && Array.isArray(b.data)) {
      meta = {};
      b.data.forEach((r) => {
        meta[r.key] = r;
      });
    }
    return { rows, meta, error: "" };
  } catch (e) {
    return { rows: {}, meta: null, error: friendly(e) };
  }
}

export function useSiteConfig() {
  const [state, setState] = useState({ loaded: false, loading: true, error: "", rows: {}, meta: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadSiteConfig().then((res) => {
      if (alive) setState({ loaded: true, loading: false, error: res.error, rows: res.rows, meta: res.meta });
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
