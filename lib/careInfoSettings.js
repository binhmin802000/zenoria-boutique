// ZENORIA_CARE_INFO_V1
import { SITE_SETTINGS_TABLE } from "./siteSettings.js";
// ============================================================
// RÉGLAGE « ENTRETIEN DU BIJOU » (clé site_settings « care_info »)
//
// { enabled, content } :
//  - enabled : interrupteur. Si faux, l'encart de la fiche produit et la page /entretien
//    affichent le message « bientôt disponible » (comme les CGV sans texte, lib/cgvSettings.js).
//  - content : texte brut saisi dans l'admin, avec un balisage leger interprete seulement a
//    l'affichage (jamais de HTML stocke en base) :
//      **mot**  -> gras
//      __mot__  -> souligne
//    Paragraphes separes par une ligne vide, comme pour les CGV (lib/cgvSettings.js).
// Reglage absent ou illisible -> desactive, contenu par defaut (cf. DEFAULT_CARE_INFO_CONTENT).
// ============================================================
export const CARE_INFO_KEY = "care_info";
export const CARE_INFO_MAX_LENGTH = 4000;

export const DEFAULT_CARE_INFO_CONTENT = [
  "Les cristaux Swarovski sont en verre, donc durs, mais le revêtement qui leur donne leurs couleurs et leur effet nacré est __fragile__. Voici une petite routine pour que votre bague garde tout son éclat.",
  "**Avant de la porter.** Mettez votre bague en dernier, après le parfum, la crème et les produits coiffants : ces produits abîment le revêtement et ternissent les couleurs.",
  "**Pendant que vous la portez.** Évitez le contact prolongé avec l'eau, ainsi que les chocs contre des surfaces dures, qui peuvent rayer ou ébrécher les cristaux. Retirez-la avant de vous laver les mains, de nager ou de faire du sport.",
  "**Pour la nettoyer.** Passez-la doucement sur un chiffon microfibre légèrement humide, puis séchez tout de suite. __Évitez de la rincer à l'eau courante ou de la laisser tremper__, et n'utilisez jamais d'alcool ni de produit ménager.",
  "**Pour la ranger.** Rangez-la séparément des autres bijoux, à l'abri de la lumière directe, dans un petit pochon en tissu ou sa boîte d'origine.",
].join("\n\n");

export const DEFAULT_CARE_INFO = { enabled: true, content: DEFAULT_CARE_INFO_CONTENT };

export function parseCareInfoSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const enabled = typeof v.enabled === "boolean" ? v.enabled : DEFAULT_CARE_INFO.enabled;
  const content = typeof v.content === "string" && v.content.trim() !== "" ? v.content : DEFAULT_CARE_INFO.content;
  return { enabled, content };
}

export function validateCareInfoContent(text) {
  const t = String(text == null ? "" : text);
  if (t.trim() === "") return { ok: false, error: "Le texte ne peut pas être vide." };
  if (t.length > CARE_INFO_MAX_LENGTH) return { ok: false, error: `${CARE_INFO_MAX_LENGTH} caractères maximum (actuellement ${t.length}).` };
  return { ok: true };
}

export function buildCareInfoValue(enabled, content) {
  return { enabled: Boolean(enabled), content: String(content == null ? "" : content) };
}

export function sameCareInfoSetting(a, b) {
  const x = parseCareInfoSetting(a);
  const y = parseCareInfoSetting(b);
  return x.enabled === y.enabled && x.content === y.content;
}

export function isDuplicateKeyError(err) {
  const msg = (err && err.message) || "";
  return /duplicate key|already exists|23505/i.test(msg);
}

export function careInfoErrorMessage(err) {
  const msg = (err && err.message) || String(err || "");
  if (/does not exist|schema cache|relation|42P01/i.test(msg)) {
    return "Le réglage n'a pas pu être lu ou écrit (table absente ou droits insuffisants).";
  }
  return "Une erreur est survenue" + (msg ? " (" + msg + ")" : "") + ".";
}

// Lecture seule, jamais bloquante (modele : fetchCgvText / fetchShippingSetting).
export async function fetchCareInfoSetting(supabase) {
  try {
    const { data, error } = await supabase.from(SITE_SETTINGS_TABLE).select("value, updated_at").eq("key", CARE_INFO_KEY).maybeSingle();
    if (error || !data) return { ...DEFAULT_CARE_INFO, updatedAt: null };
    const cfg = parseCareInfoSetting(data.value);
    return { ...cfg, updatedAt: data.updated_at || null };
  } catch (e) {
    return { ...DEFAULT_CARE_INFO, updatedAt: null };
  }
}

// ============================================================
// BALISAGE LEGER : **gras** et __souligne__, jamais de HTML.
// ============================================================

// Un mot enveloppe de ** ou de __ est-il valide (au moins un caractere a l'interieur) ?
function isWrapped(text, marker) {
  return text.length > marker.length * 2 && text.startsWith(marker) && text.endsWith(marker);
}

// Decoupe une ligne en segments { text, bold, underline } (pas de HTML, juste des donnees).
// Priorite : ** avant __, sans imbrication (un passage est soit en gras, soit souligne, soit les deux
// si les deux marqueurs encadrent le meme mot dans n'importe quel ordre).
export function parseCareInfoInline(line) {
  const text = String(line == null ? "" : line);
  // Un seul passe : on repere alternativement **...** et __...__, le texte autour reste simple.
  const re = /(\*\*[^*]+\*\*|__[^_]+__)/g;
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false, underline: false });
    const token = m[0];
    if (isWrapped(token, "**")) out.push({ text: token.slice(2, -2), bold: true, underline: false });
    else out.push({ text: token.slice(2, -2), bold: false, underline: true });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false, underline: false });
  if (out.length === 0) out.push({ text: "", bold: false, underline: false });
  return out;
}

// Texte brut -> paragraphes -> lignes -> segments. Structure neutre (pas de JSX), pour etre
// testee sans navigateur ; le rendu (gras/souligne/<br/>) est fait par le composant appelant.
export function parseCareInfoContent(text) {
  const t = String(text == null ? "" : text).replace(/\r\n/g, "\n");
  const paragraphs = t.split(/\n\s*\n/).filter((p) => p.trim() !== "");
  return paragraphs.map((paragraph) => {
    const lines = paragraph.split("\n").filter((l) => l.trim() !== "");
    return lines.map((line) => parseCareInfoInline(line));
  });
}

// Un resume court (premiere phrase ou ~160 caracteres) pour l'encart de la fiche produit.
export function careInfoExcerpt(text, maxLength = 170) {
  const plain = String(text == null ? "" : text)
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)[0]
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  const cut = plain.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}
