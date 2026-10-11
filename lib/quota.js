// ============================================================
// quota.js - Calculs des jauges de quotas (Supabase et Vercel), sans dependance
//
// Les LIMITES dependent du forfait choisi dans l'onglet « Quotas » : on les change en
// choisissant le forfait, pas en modifiant le code.
//
// Seuils d'alerte : 70 % (orange) et 90 % (rouge).
// Sources des limites : pages officielles des forfaits Supabase et Vercel (consultees en octobre 2026).
// Les limites changent : verifiez-les de temps en temps sur les pages « Pricing » des deux services.
// ============================================================

export const WARN_PERCENT = 70;
export const CRITICAL_PERCENT = 90;
export const STALE_DAYS = 7; // un releve manuel plus ancien est signale

const MB = 1024 * 1024;
const GB = 1024 * MB;

// ---------- Forfaits ----------
export const SUPABASE_PLANS = {
  free: {
    label: "Gratuit",
    dbBytes: 500 * MB,       // taille de la base de donnees
    storageBytes: 1 * GB,    // fichiers (photos, videos)
    mau: 50000,              // utilisateurs actifs par mois
    egressBytes: 5 * GB,     // transfert sortant
  },
  pro: {
    label: "Pro (25 $/mois)",
    dbBytes: 8 * GB,         // disque de 8 Go, qui contient la base
    storageBytes: 100 * GB,
    mau: 100000,
    egressBytes: 250 * GB,
  },
};

export const VERCEL_PLANS = {
  hobby: {
    label: "Hobby (gratuit, usage non commercial)",
    commercialOk: false,
    limits: { fdt: 100 * GB, edge: 1000000, invocations: 1000000, build: 6000 },
  },
  pro: {
    label: "Pro",
    commercialOk: true,
    // Pro : transfert 1 To inclus et 1 M d'appels de fonctions inclus ; les requetes et les minutes de build sont
    // facturees a l'usage, sans plafond connu ici (null) : la jauge n'est pas affichee.
    limits: { fdt: 1000 * GB, edge: null, invocations: 1000000, build: null },
  },
};

export const DEFAULT_SUPABASE_PLAN = "free";
export const DEFAULT_VERCEL_PLAN = "hobby";

// Releves saisis a la main (non lisibles automatiquement depuis le site)
export const MANUAL_METRICS = [
  { key: "supabase_egress", service: "Supabase", label: "Transfert sortant", unit: "go", hint: "Supabase → votre organisation → Usage → Egress" },
  { key: "vercel_fdt", service: "Vercel", label: "Transfert de données rapide (Fast Data Transfer)", unit: "go", hint: "Vercel → Usage → Fast Data Transfer" },
  { key: "vercel_edge", service: "Vercel", label: "Requêtes (Edge / CDN Requests)", unit: "count", hint: "Vercel → Usage → Edge Requests" },
  { key: "vercel_invocations", service: "Vercel", label: "Appels de fonctions", unit: "count", hint: "Vercel → Usage → Function Invocations" },
  { key: "vercel_build", service: "Vercel", label: "Minutes de build", unit: "minutes", hint: "Vercel → Usage → Build Execution" },
];

// ---------- Niveaux ----------
export function levelFor(percent) {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return "unknown";
  if (percent >= CRITICAL_PERCENT) return "critical";
  if (percent >= WARN_PERCENT) return "warn";
  return "ok";
}

export const LEVEL_STYLE = {
  ok: { label: "Dans la limite", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  warn: { label: "À surveiller", bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  critical: { label: "Critique", bar: "bg-red-500", chip: "bg-red-50 text-red-700" },
  unknown: { label: "Pas de relevé", bar: "bg-[#d9c5cc]", chip: "bg-[#f0e6ea] text-[#8b737e]" },
};

// ---------- Formats ----------
export function formatBytes(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v >= GB) return (v / GB).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + " Go";
  if (v >= MB) return (v / MB).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " Mo";
  if (v >= 1024) return Math.round(v / 1024).toLocaleString("fr-FR") + " Ko";
  return Math.round(v).toLocaleString("fr-FR") + " octets";
}

export function formatCount(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Math.round(Number(n)).toLocaleString("fr-FR");
}

export function percentOf(used, limit) {
  if (used === null || used === undefined || !limit) return null;
  return Math.round((Number(used) / limit) * 1000) / 10; // 1 decimale
}

// ---------- Releves manuels ----------
export function parseManual(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    const values = obj.values && typeof obj.values === "object" ? obj.values : {};
    return { values, read_at: obj.read_at || null, by: obj.by || null };
  } catch (e) {
    return null;
  }
}

export function isStale(readAt, now = Date.now(), days = STALE_DAYS) {
  if (!readAt) return true;
  const t = new Date(readAt).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > days * 24 * 3600 * 1000;
}

// Valeur saisie (Go, nombre, minutes) -> valeur de travail (octets pour les Go)
export function manualToBase(metric, value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return metric.unit === "go" ? n * GB : n;
}

function limitFor(metricKey, supabasePlan, vercelPlan) {
  const sp = SUPABASE_PLANS[supabasePlan] || SUPABASE_PLANS[DEFAULT_SUPABASE_PLAN];
  const vp = VERCEL_PLANS[vercelPlan] || VERCEL_PLANS[DEFAULT_VERCEL_PLAN];
  switch (metricKey) {
    case "supabase_egress": return sp.egressBytes;
    case "vercel_fdt": return vp.limits.fdt;
    case "vercel_edge": return vp.limits.edge;
    case "vercel_invocations": return vp.limits.invocations;
    case "vercel_build": return vp.limits.build;
    default: return null;
  }
}

// ---------- Jauges ----------
// summary : { db_bytes, storage_bytes, storage_objects, users_total, users_active_30d } (ou null)
export function buildGauges({ summary, supabasePlan, vercelPlan, manual, now = Date.now() }) {
  const sp = SUPABASE_PLANS[supabasePlan] || SUPABASE_PLANS[DEFAULT_SUPABASE_PLAN];
  const gauges = [];

  const auto = (key, service, label, used, limit, format, note) => {
    const percent = percentOf(used, limit);
    gauges.push({
      key, service, label, source: "auto", used, limit, percent, level: levelFor(percent),
      usedText: used === null || used === undefined ? "—" : format(used),
      limitText: limit ? format(limit) : "—", note: note || "", stale: false,
    });
  };
  const s = summary || {};
  auto("db", "Supabase", "Base de données", s.db_bytes ?? null, sp.dbBytes, formatBytes,
    "Au-delà de la limite, la base passe en lecture seule : le catalogue reste visible mais aucune commande ni inscription ne s'enregistre.");
  auto("storage", "Supabase", "Fichiers (photos et vidéos)", s.storage_bytes ?? null, sp.storageBytes, formatBytes, "");
  auto("mau", "Supabase", "Comptes connectés sur 30 jours (estimation)", s.users_active_30d ?? null, sp.mau, formatCount,
    "Approximation : nombre de comptes dont la dernière connexion date de moins de 30 jours.");

  const m = manual || { values: {}, read_at: null };
  const stale = isStale(m.read_at, now);
  MANUAL_METRICS.forEach((metric) => {
    const limit = limitFor(metric.key, supabasePlan, vercelPlan);
    const used = manualToBase(metric, m.values ? m.values[metric.key] : null);
    const percent = percentOf(used, limit);
    const format = metric.unit === "go" ? formatBytes : formatCount;
    gauges.push({
      key: metric.key, service: metric.service, label: metric.label, source: "manual", used, limit, percent,
      level: levelFor(percent),
      usedText: used === null ? "—" : metric.unit === "minutes" ? formatCount(used) + " min" : format(used),
      limitText: limit ? (metric.unit === "minutes" ? formatCount(limit) + " min" : format(limit)) : "pas de plafond connu",
      note: "", stale: used !== null && stale, hint: metric.hint,
    });
  });
  return gauges;
}

// Alertes a afficher : jauges orange ou rouges (les plus chargees d'abord), plus les releves manuels trop anciens.
export function buildAlerts(gauges, manual, now = Date.now()) {
  const alerts = gauges
    .filter((g) => g.level === "warn" || g.level === "critical")
    .sort((a, b) => (b.percent || 0) - (a.percent || 0))
    .map((g) => ({
      key: g.key, level: g.level, service: g.service, label: g.label, percent: g.percent,
      text: `${g.service} · ${g.label} : ${g.percent} % (${g.usedText} sur ${g.limitText})`,
      note: g.note,
    }));
  const hasManual = gauges.some((g) => g.source === "manual" && g.used !== null);
  if (hasManual && manual && isStale(manual.read_at, now)) {
    alerts.push({ key: "stale", level: "warn", service: "Relevé manuel", label: "Relevé ancien", percent: null,
      text: `Le relevé manuel Supabase / Vercel date de plus de ${STALE_DAYS} jours : refaites-le.`, note: "" });
  }
  return alerts;
}

export function worstLevel(alerts) {
  if (alerts.some((a) => a.level === "critical")) return "critical";
  if (alerts.some((a) => a.level === "warn")) return "warn";
  return "ok";
}
