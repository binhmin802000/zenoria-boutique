// ============================================================
// scripts/patch-histoire-charte-avis.mjs — chantier « Notre histoire + charte des avis »
// ZENORIA_STORY_REVIEWS_V1
//
// Usage (depuis le dossier zenoria, sur la branche notre-histoire-charte-avis) :
//   node scripts\patch-histoire-charte-avis.mjs           -> vérifie tout, puis applique
//   node scripts\patch-histoire-charte-avis.mjs --dry-run -> vérifie seulement, n'écrit rien
//
// Sécurité :
//  - TOUTES les vérifications sont faites avant la moindre écriture : si un repère manque, rien n'est modifié ;
//  - chaque repère doit être trouvé exactement une fois ;
//  - rejouable : un fichier déjà modifié (marqueur ZENORIA_STORY_REVIEWS_V1) est laissé tel quel ;
//  - un fichier nouveau déjà présent avec un contenu différent n'est jamais écrasé ;
//  - encodage UTF-8, BOM et fins de ligne (CRLF/LF) de chaque fichier conservés.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_STORY_REVIEWS_V1";
const BRANCH = "notre-histoire-charte-avis";
const DRY = process.argv.includes("--dry-run");
const NEW_FILES = {
  "lib/reviewsSettings.js": "// ============================================================\n// RÉGLAGE « AVIS CLIENTES » (interrupteur ON/OFF) — ZENORIA_STORY_REVIEWS_V1\n//\n// Fichier SANS dépendance, sur le modèle de lib/shippingSettings.js.\n// Utilisé par l'administration (components/AdminLegalPages.js), la page d'accueil (lien du footer)\n// et la page /charte-des-avis.\n//\n// Enregistrement : table « site_settings », clé « reviews », valeur JSON : { \"enabled\": false }\n//   enabled : true  -> avis visibles ET charte /charte-des-avis visible\n//             false -> avis masqués ET charte masquée (404), lien du footer retiré\n// Les avis déjà déposés ne sont jamais supprimés par cet interrupteur.\n//\n// Réglage absent ou illisible : DEFAULT_REVIEWS = DÉSACTIVÉ.\n// Choix volontaire : on n'affiche jamais des avis sans leur charte par accident.\n// La Politique de confidentialité n'a PAS d'interrupteur : elle reste toujours en ligne (RGPD).\n// ============================================================\n\nexport const REVIEWS_KEY = \"reviews\";\nexport const DEFAULT_REVIEWS = Object.freeze({ enabled: false });\n\n// Valeurs de la charte : une seule source de vérité\nexport const REVIEWS_RULES = Object.freeze({\n  windowDays: 30, // délai pour déposer un avis après la livraison\n  maxCommentLength: 1000, // caractères maximum du commentaire\n  moderationDays: 5, // jours ouvrés maximum de modération\n  publicationYears: 3, // durée de publication d'un avis\n  minReviewsForAverage: 3, // note moyenne affichée à partir de ce nombre d'avis\n});\n\nexport function parseReviewsSetting(value) {\n  const v = value && typeof value === \"object\" && !Array.isArray(value) ? value : {};\n  return { enabled: typeof v.enabled === \"boolean\" ? v.enabled : DEFAULT_REVIEWS.enabled };\n}\n\nexport function buildReviewsValue(s) {\n  return parseReviewsSetting(s);\n}\n\nexport function sameReviewsSetting(a, b) {\n  return parseReviewsSetting(a).enabled === parseReviewsSetting(b).enabled;\n}\n\nexport function describeReviews(setting) {\n  return parseReviewsSetting(setting).enabled\n    ? \"avis clientes et charte des avis visibles\"\n    : \"avis clientes et charte des avis masqués\";\n}\n\n// Lecture côté site ou serveur. Ne lève jamais d'erreur : en cas de problème, réglage par défaut (désactivé).\nexport async function fetchReviewsSetting(client, table = \"site_settings\") {\n  try {\n    const res = await client.from(table).select(\"value\").eq(\"key\", REVIEWS_KEY).maybeSingle();\n    if (res && !res.error && res.data) return parseReviewsSetting(res.data.value);\n  } catch (e) {\n    // réglage illisible : valeur par défaut\n  }\n  return DEFAULT_REVIEWS;\n}\n",
  "components/StorySection.js": "import React, { useEffect, useRef, useState } from \"react\";\nimport TextLines from \"@/components/TextLines\";\n\n// ============================================================\n// SECTION « NOTRE HISTOIRE » (page d'accueil) — ZENORIA_STORY_REVIEWS_V1\n//\n// Textes : lib/siteTexts.js, groupe « story » (modifiables dans /admin > Contenu du site > Textes du site).\n//   story_eyebrow, story_title, story_lead : visibles d'emblée ;\n//   story_body : version longue, paragraphes séparés par une ligne vide ;\n//   story_signature : phrase finale en italique doré.\n// Le bouton « Découvrir notre histoire » du bloc philosophie envoie l'événement OPEN_STORY_EVENT :\n// la section se déplie et vient à l'écran. L'adresse /#notre-histoire fait de même.\n// ============================================================\n\nexport const OPEN_STORY_EVENT = \"zenoria:open-story\";\n\nexport function splitParagraphs(text) {\n  return String(text || \"\")\n    .split(/\\n\\s*\\n/)\n    .map((p) => p.trim())\n    .filter(Boolean);\n}\n\nexport default function StorySection({ texts }) {\n  const t = texts || {};\n  const [open, setOpen] = useState(false);\n  const ref = useRef(null);\n  const paragraphs = splitParagraphs(t.story_body);\n\n  useEffect(() => {\n    const reveal = () => {\n      setOpen(true);\n      // laisse React afficher la version longue avant de faire défiler\n      setTimeout(() => {\n        if (ref.current) ref.current.scrollIntoView({ behavior: \"smooth\", block: \"start\" });\n      }, 60);\n    };\n    window.addEventListener(OPEN_STORY_EVENT, reveal);\n    if (window.location.hash === \"#notre-histoire\") reveal();\n    return () => window.removeEventListener(OPEN_STORY_EVENT, reveal);\n  }, []);\n\n  return (\n    <section id=\"notre-histoire\" ref={ref} data-testid=\"story-section\" className=\"max-w-3xl mx-auto px-6 py-20 scroll-mt-24 text-center\">\n      {t.story_eyebrow && <p className=\"text-xs uppercase tracking-[.25em] text-[#b48a5a]\">{t.story_eyebrow}</p>}\n      <h2 className=\"font-serif text-4xl text-[#412f3b] mt-3\">{t.story_title}</h2>\n      <p className=\"font-serif text-lg leading-8 text-[#412f3b] mt-6\">\n        <TextLines text={t.story_lead} />\n      </p>\n      {open && (\n        <div data-testid=\"story-more\" className=\"mt-8\">\n          <div className=\"mx-auto mb-8 h-px w-12 bg-[#b48a5a]\" />\n          <div className=\"space-y-5 text-left text-[15px] leading-7 text-[#54434c]\">\n            {paragraphs.map((p, i) => (\n              <p key={i}>\n                <TextLines text={p} />\n              </p>\n            ))}\n          </div>\n          {t.story_signature && <p className=\"font-serif italic text-lg text-[#b48a5a] mt-8\">{t.story_signature}</p>}\n        </div>\n      )}\n      <button\n        type=\"button\"\n        onClick={() => setOpen((o) => !o)}\n        aria-expanded={open}\n        data-testid=\"story-toggle\"\n        className=\"mt-8 rounded-full border border-[#412f3b] text-[#412f3b] px-6 h-10 text-sm hover:bg-[#412f3b] hover:text-white transition-colors\"\n      >\n        {open ? \"Refermer\" : \"Lire notre histoire\"}\n      </button>\n    </section>\n  );\n}\n",
  "components/AdminLegalPages.js": "import React, { useCallback, useEffect, useState } from \"react\";\nimport { Star, Lock, RefreshCw } from \"lucide-react\";\nimport { supabase } from \"@/lib/supabase\";\nimport { SITE_SETTINGS_TABLE } from \"@/lib/siteSettings\";\nimport { REVIEWS_KEY, parseReviewsSetting, buildReviewsValue, describeReviews } from \"@/lib/reviewsSettings\";\n\n// ============================================================\n// CARTES « AVIS CLIENTES » ET « POLITIQUE DE CONFIDENTIALITÉ » (onglet « Contenu du site » de /admin)\n// ZENORIA_STORY_REVIEWS_V1\n//\n// Avis clientes : un interrupteur unique, table « site_settings », clé « reviews », valeur { \"enabled\": true|false }.\n//   ON  : avis visibles, page /charte-des-avis et lien du footer visibles ;\n//   OFF : tout est masqué (/charte-des-avis renvoie 404). Les avis déjà déposés restent en base.\n//   Ligne absente ou illisible : OFF (voir lib/reviewsSettings.js).\n// Confidentialité : aucune action possible, la page reste toujours en ligne (obligation RGPD).\n// Prérequis SQL : contrainte site_settings_reviews_valid et lecture publique de la clé « reviews ».\n// ============================================================\n\nconst TIME_ZONE = \"Europe/Paris\";\n\nfunction formatDateTime(value) {\n  if (!value) return null;\n  return new Date(value).toLocaleString(\"fr-FR\", { dateStyle: \"short\", timeStyle: \"short\", timeZone: TIME_ZONE });\n}\n\nfunction friendlyError(err) {\n  const msg = (err && err.message) || String(err || \"\");\n  if (/site_settings_reviews_valid|violates check constraint/i.test(msg)) {\n    return \"La base refuse cette valeur. Vérifiez que la contrainte site_settings_reviews_valid est bien installée dans Supabase.\";\n  }\n  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {\n    return \"La table des réglages n'est pas installée. Exécutez le script supabase_site_settings.sql dans Supabase (SQL Editor).\";\n  }\n  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {\n    return \"Enregistrement refusé : ce compte n'a pas les droits d'administration.\";\n  }\n  return msg;\n}\n\nexport default function AdminLegalPages() {\n  const [row, setRow] = useState(null);\n  const [loading, setLoading] = useState(true);\n  const [loadError, setLoadError] = useState(\"\");\n  const [saving, setSaving] = useState(false);\n  const [error, setError] = useState(\"\");\n  const [toast, setToast] = useState(\"\");\n\n  const load = useCallback(async () => {\n    setLoading(true);\n    setLoadError(\"\");\n    try {\n      const res = await supabase.from(SITE_SETTINGS_TABLE).select(\"*\").eq(\"key\", REVIEWS_KEY).maybeSingle();\n      if (res.error) setLoadError(friendlyError(res.error));\n      else setRow(res.data || null);\n    } catch (err) {\n      setLoadError(friendlyError(err));\n    }\n    setLoading(false);\n  }, []);\n\n  useEffect(() => {\n    load();\n  }, [load]);\n\n  useEffect(() => {\n    if (!toast) return undefined;\n    const t = setTimeout(() => setToast(\"\"), 4000);\n    return () => clearTimeout(t);\n  }, [toast]);\n\n  const enabled = parseReviewsSetting(row ? row.value : null).enabled;\n  const disabled = loading || Boolean(loadError) || saving;\n  const savedAt = row ? formatDateTime(row.updated_at) : null;\n\n  const toggle = async () => {\n    const next = !enabled;\n    setError(\"\");\n    setSaving(true);\n    try {\n      const { error: err } = await supabase\n        .from(SITE_SETTINGS_TABLE)\n        .upsert({ key: REVIEWS_KEY, value: buildReviewsValue({ enabled: next }) }, { onConflict: \"key\" });\n      if (err) throw err;\n      setToast(\n        next\n          ? \"Avis clientes activés : la charte des avis est en ligne. Les visiteurs le voient au prochain chargement de la page.\"\n          : \"Avis clientes désactivés : avis et charte des avis sont masqués. Les avis déjà déposés sont conservés.\"\n      );\n      await load();\n    } catch (err) {\n      setError(\"Échec de l'enregistrement : \" + friendlyError(err));\n    }\n    setSaving(false);\n  };\n\n  return (\n    <>\n      <section data-testid=\"reviews-panel\" className=\"mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5\">\n        <div className=\"flex justify-between items-start gap-3\">\n          <div className=\"min-w-0\">\n            <h2 className=\"font-serif text-xl flex items-center gap-2\">\n              <Star size={18} className=\"text-[#8f6075]\" /> Avis clientes\n            </h2>\n            <p className=\"text-xs text-[#8b737e] mt-1 leading-4\">\n              Un seul interrupteur pour les avis et leur charte. Activé : avis visibles, page /charte-des-avis et lien du pied de page en ligne. Désactivé : tout est masqué, les avis déjà déposés restent enregistrés.\n            </p>\n          </div>\n          <div className=\"shrink-0 flex items-center gap-2\">\n            <button\n              type=\"button\"\n              onClick={load}\n              disabled={loading}\n              aria-label=\"Actualiser le réglage des avis\"\n              className=\"h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60\"\n            >\n              <RefreshCw size={14} className={loading ? \"animate-spin\" : \"\"} />\n            </button>\n            <button\n              type=\"button\"\n              role=\"switch\"\n              aria-checked={enabled}\n              aria-label=\"Avis clientes et charte des avis\"\n              onClick={toggle}\n              disabled={disabled}\n              data-testid=\"reviews-switch\"\n              className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${enabled ? \"bg-emerald-600\" : \"bg-[#d9cfd3]\"}`}\n            >\n              <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? \"translate-x-5\" : \"\"}`} />\n            </button>\n          </div>\n        </div>\n\n        {toast && <div data-testid=\"reviews-toast\" className=\"mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm\">{toast}</div>}\n        {loadError && <div role=\"alert\" className=\"mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm\">{loadError}</div>}\n        {error && <div role=\"alert\" className=\"mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm\">{error}</div>}\n\n        {!loadError && !loading && (\n          <p data-testid=\"reviews-saved-text\" className=\"mt-4 text-[11px] text-[#54434c] leading-4\">\n            Réglage actuel : <strong className=\"font-medium\">{describeReviews(row ? row.value : null)}</strong>\n            {savedAt && (\n              <span className=\"text-[#8b737e]\">\n                {\" \"}· modifié le {savedAt}\n                {row && row.updated_by_email ? ` · ${row.updated_by_email}` : \"\"}\n              </span>\n            )}\n            {!row && <span className=\"text-[#8b737e]\"> · rien d&apos;enregistré (désactivé par défaut)</span>}\n          </p>\n        )}\n      </section>\n\n      <section data-testid=\"privacy-panel\" className=\"mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5\">\n        <div className=\"flex flex-wrap justify-between items-start gap-3\">\n          <div className=\"min-w-0\">\n            <h2 className=\"font-serif text-xl flex items-center gap-2\">\n              <Lock size={18} className=\"text-[#8f6075]\" /> Politique de confidentialité\n            </h2>\n            <p className=\"text-xs text-[#8b737e] mt-1 leading-4\">\n              Page /confidentialite : obligatoire (RGPD), elle ne peut pas être désactivée. Son contenu se modifie dans le code (pages/confidentialite.js).\n            </p>\n          </div>\n          <div className=\"shrink-0 flex items-center gap-3\">\n            <span className=\"text-[11px] rounded-full px-3 py-1 bg-[#eef0f6] text-[#4a5578]\">Toujours en ligne</span>\n            <a href=\"/confidentialite\" target=\"_blank\" rel=\"noopener noreferrer\" className=\"text-[11px] text-[#8f6075] underline underline-offset-2\">\n              Voir la page\n            </a>\n          </div>\n        </div>\n      </section>\n    </>\n  );\n}\n",
  "pages/charte-des-avis.js": "// ZENORIA_STORY_REVIEWS_V1\nimport React from \"react\";\nimport Head from \"next/head\";\nimport { supabase } from \"@/lib/supabase\";\nimport { fetchReviewsSetting, REVIEWS_RULES } from \"@/lib/reviewsSettings\";\n\n// ============================================================\n// PAGE « CHARTE DES AVIS CLIENTES » — /charte-des-avis\n//\n// Visible seulement si l'interrupteur « Avis clientes » est activé (/admin > Contenu du site).\n// Désactivé, absent ou illisible : vraie page 404.\n// Informations exigées par l'article D111-17 du Code de la consommation : contrôle des avis,\n// dates, critère de classement, contrepartie, délais de publication et de conservation.\n// Les valeurs chiffrées viennent de REVIEWS_RULES (lib/reviewsSettings.js).\n// Même mise en page que pages/mentions-legales.js et pages/confidentialite.js.\n// ============================================================\n\nconst CONTACT_EMAIL = \"bagues.mandala@proton.me\";\n\nconst Section = ({ id, title, children }) => (\n  <section id={id} className=\"mt-9\">\n    <h2 className=\"font-serif text-2xl mb-3 text-[#412f3b]\">{title}</h2>\n    <div className=\"space-y-3 text-[15px] leading-7 text-[#54434c]\">{children}</div>\n  </section>\n);\n\nexport async function getServerSideProps({ res }) {\n  const setting = await fetchReviewsSetting(supabase);\n  res.setHeader(\"Cache-Control\", \"no-store, max-age=0\");\n  if (!setting.enabled) return { notFound: true };\n  return { props: {} };\n}\n\nexport default function CharteDesAvis() {\n  const r = REVIEWS_RULES;\n  const maxChars = r.maxCommentLength.toLocaleString(\"fr-FR\");\n  return (\n    <div className=\"min-h-screen bg-[#fbf8f4] text-[#342b32]\">\n      <Head>\n        <title>Charte des avis clientes – Zenoria</title>\n      </Head>\n\n      <header className=\"border-b border-[#eadfe4] bg-[#fbf8f4]/95\">\n        <div className=\"max-w-3xl mx-auto px-6 h-16 flex items-center justify-between\">\n          <a href=\"/\" className=\"font-serif text-xl tracking-[.22em] text-[#412f3b]\">ZENORIA</a>\n          <a href=\"/\" className=\"text-sm text-[#8f6075] underline\">Retour à la boutique</a>\n        </div>\n      </header>\n\n      <main className=\"max-w-3xl mx-auto px-6 py-12\">\n        <h1 className=\"font-serif text-4xl text-[#412f3b]\">Charte des avis clientes</h1>\n        <p className=\"mt-4 text-[15px] leading-7 text-[#54434c]\">\n          Vos avis aident d&apos;autres clientes à choisir leur bijou. Cette charte explique comment ils sont recueillis, contrôlés et publiés.\n        </p>\n\n        <Section id=\"qui\" title=\"Qui peut déposer un avis ?\">\n          <p>Seules les clientes ayant reçu une commande peuvent donner leur avis sur les bijoux achetés. Chaque avis porte ainsi la mention « Achat vérifié ».</p>\n        </Section>\n\n        <Section id=\"quand\" title=\"Quand ?\">\n          <p>Pendant les {r.windowDays} jours qui suivent la livraison.</p>\n        </Section>\n\n        <Section id=\"contenu\" title=\"Contenu d'un avis\">\n          <p>Une note de 1 à 5 étoiles (obligatoire) et un commentaire facultatif de {maxChars} caractères maximum.</p>\n        </Section>\n\n        <Section id=\"controle\" title=\"Contrôle des avis\">\n          <p>Chaque avis est relu par notre équipe avant publication, sous {r.moderationDays} jours ouvrés maximum. Nous ne modifions jamais le contenu d&apos;un avis, et nous publions aussi bien les avis positifs que les avis négatifs.</p>\n          <p>Un avis peut être refusé uniquement s&apos;il contient des propos injurieux ou discriminatoires, des données personnelles, de la publicité, ou s&apos;il ne concerne pas le produit. Son autrice est alors informée du motif du refus.</p>\n        </Section>\n\n        <Section id=\"affichage\" title=\"Affichage et classement\">\n          <p>Les avis sont présentés du plus récent au plus ancien. Chaque avis affiche sa date de publication et la date de la commande concernée. La note moyenne d&apos;un bijou apparaît à partir de {r.minReviewsForAverage} avis publiés.</p>\n        </Section>\n\n        <Section id=\"contrepartie\" title=\"Contrepartie\">\n          <p>Aucune contrepartie n&apos;est offerte en échange d&apos;un avis.</p>\n        </Section>\n\n        <Section id=\"duree\" title=\"Durée de publication\">\n          <p>Un avis reste en ligne {r.publicationYears} ans. Son autrice peut demander à tout moment qu&apos;il soit supprimé.</p>\n        </Section>\n\n        <Section id=\"donnees\" title=\"Vos données\">\n          <p>\n            Le traitement des données liées aux avis est décrit dans notre{\" \"}\n            <a href=\"/confidentialite#avis\" className=\"underline text-[#8f6075]\">politique de confidentialité</a>.\n          </p>\n        </Section>\n\n        <Section id=\"contact\" title=\"Contact\">\n          <p>\n            Pour toute question sur un avis :{\" \"}\n            <a href={`mailto:${CONTACT_EMAIL}`} className=\"underline text-[#8f6075]\">{CONTACT_EMAIL}</a>\n          </p>\n        </Section>\n      </main>\n    </div>\n  );\n}\n"
};

const ok = (m) => console.log("  \u2713 " + m);
const info = (m) => console.log("  \u00b7 " + m);
class Stop extends Error {}
const fail = (m) => { throw new Stop(m); };

function read(rel) {
  if (!fs.existsSync(rel)) fail(`fichier introuvable : ${rel} (lancez le script depuis le dossier zenoria)`);
  let text = fs.readFileSync(rel, "utf8");
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { rel, bom, eol, text: text.replace(/\r\n/g, "\n") };
}
function toDisk(f, text) {
  return (f.bom ? "\uFEFF" : "") + (f.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);
}
function once(text, re, replacer, label) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const n = (text.match(g) || []).length;
  if (n !== 1) fail(`repère « ${label} » trouvé ${n} fois (1 attendu)`);
  return text.replace(re, replacer);
}

// ---------------- Textes ajoutés ----------------
const STORY_GROUP = `{ id: "story", title: "Accueil : notre histoire", hint: "L'accroche visible, la version longue (dépliée par « Lire notre histoire ») et la phrase signature. Version longue : une ligne vide entre deux paragraphes." },`;
const STORY_FIELDS = [
  `// ---------- Accueil : notre histoire (${MARK}) ----------`,
  `{ key: "story_eyebrow", group: "story", label: "Étiquette au-dessus du titre", def: "Zenoria", max: 40 },`,
  `{ key: "story_title", group: "story", label: "Titre", def: "Notre histoire", max: 60 },`,
  `{`,
  `  key: "story_lead", group: "story", label: "Accroche (visible sans déplier)", multiline: true, max: 350, maxLines: 3, rows: 3,`,
  `  def: "Il y a dix ans, notre fondatrice façonnait sa première bague, avec une conviction : un bijou peut révéler la lumière de celle qui le porte. Chaque création Zenoria prolonge ce geste, avec patience et précision.",`,
  `},`,
  `{`,
  `  key: "story_body", group: "story", label: "Version longue (une ligne vide entre deux paragraphes)", multiline: true, max: 2500, maxLines: 16, rows: 12,`,
  `  def: "Il y a dix ans, la fondatrice de Zenoria a façonné sa première bague. Elle cherchait alors à créer un objet capable de mettre en lumière ce que chacune porte en elle : une énergie, une histoire, une part de soi que les mots ne disent pas toujours.\\n\\nDe ce premier geste est né un savoir-faire patient. Chaque pierre est choisie pour sa couleur et ce qu'elle évoque. Chaque monture est travaillée à la main, avec l'exigence du détail et le respect du temps qu'il faut.\\n\\nNous croyons que nous sommes tous des êtres lumineux. Parfois, cette lumière se voile sous le poids des jours, du doute ou de la fatigue. Pourtant, elle ne disparaît jamais. Un bijou ne la crée pas : il la rappelle. Porter une bague Zenoria, c'est garder à portée de main un éclat de soi. C'est un repère discret qui murmure, au fil des saisons : tu brilles déjà.",`,
  `},`,
  `{ key: "story_signature", group: "story", label: "Phrase signature (italique doré)", def: "C'est cette lumière que nous souhaitons transmettre, de nos mains aux vôtres.", max: 140 },`,
  ``,
];

const PRIVACY_SECTIONS = [
  `{/* ${MARK} : avis clientes et journal des connexions */}`,
  `<Section id="avis" title="Avis clientes">`,
  `  <p>Si vous publiez un avis, nous traitons votre prénom suivi de l&apos;initiale de votre nom, votre note, votre commentaire, la date de l&apos;avis et le bijou concerné. L&apos;avis est rattaché à votre commande, pour garantir la mention « Achat vérifié ».</p>`,
  `  <p>Un avis reste en ligne pendant 3 ans, ou jusqu&apos;à ce que vous demandiez sa suppression à l&apos;adresse <a href="mailto:bagues.mandala@proton.me" className="underline text-[#8f6075]">bagues.mandala@proton.me</a>.</p>`,
  `</Section>`,
  ``,
  `<Section id="connexions" title="Journal des connexions">`,
  `  <p>Pour la sécurité de votre compte, nous enregistrons les connexions, déconnexions, inscriptions et changements de mot de passe : adresse e-mail, date, heure et adresse IP. Ce journal sert uniquement à détecter et analyser les accès anormaux.</p>`,
  `  <p>Ces données sont conservées 12 mois, puis supprimées.</p>`,
  `</Section>`,
  ``,
];

// ---------------- Modifications par fichier ----------------
const PATCHES = {
  "lib/siteTexts.js": (t) => {
    if (/key: "story_body"/.test(t)) fail("lib/siteTexts.js contient déjà story_body sans le marqueur : vérifiez à la main");
    t = once(t, /^([ \t]*)\{ id: "philo",[^\n]*\},[ \t]*$/m, (m, ind) => `${m}\n${ind}${STORY_GROUP}`, "groupe philo (TEXT_GROUPS)");
    t = once(
      t,
      /^([ \t]*)\/\/ ---------- Accueil : invitation au quiz ----------[ \t]*$/m,
      (m, ind) => STORY_FIELDS.map((l) => (l ? ind + l : "")).join("\n") + "\n" + m,
      "commentaire « Accueil : invitation au quiz » (TEXT_FIELDS)"
    );
    return t;
  },

  "pages/index.js": (t) => {
    t = once(
      t,
      /^import \{ SITE_TEXTS_KEY[^\n]*from "@\/lib\/siteTexts";[ \t]*$/m,
      (m) => `${m}\n// ${MARK}\nimport { REVIEWS_KEY, DEFAULT_REVIEWS, parseReviewsSetting } from "@/lib/reviewsSettings";\nimport StorySection, { OPEN_STORY_EVENT } from "@/components/StorySection";`,
      "import siteTexts"
    );
    t = once(t, /\[SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY\]/, "[SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY]", "liste des réglages lus (ligne ~262)");
    t = once(
      t,
      /^([ \t]*)const \[shippingCfg, setShippingCfg\] = useState\([^\n]*\);[^\n]*$/m,
      (m, ind) => `${m}\n${ind}const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS); // avis clientes + charte (admin : Contenu du site)`,
      "état shippingCfg"
    );
    t = once(
      t,
      /^([ \t]*)const contactRow = settingRows\.find\(\(r\) => r\.key === CONTACT_KEY\) \|\| null;[^\n]*$/m,
      (m, ind) => `${m}\n${ind}// Avis clientes : ligne absente ou illisible -> désactivé (lien de la charte masqué)\n${ind}const reviewsRow = settingRows.find((r) => r.key === REVIEWS_KEY) || null;\n${ind}setReviewsCfg(parseReviewsSetting(reviewsRow ? reviewsRow.value : null));`,
      "lecture contactRow"
    );
    t = once(
      t,
      /<Button(\s+)variant="outline"(\s+)className="mt-8 w-fit rounded-full border-white\/40\s+bg-transparent text-white"/,
      (m) => `${m} onClick={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))}`,
      "bouton « Découvrir notre histoire »"
    );
    t = once(
      t,
      /^([ \t]*)\{\/\* QUIZ COULEURS \(invitation\)[^\n]*\*\/\}[ \t]*$/m,
      (m, ind) => `${ind}{/* NOTRE HISTOIRE : textes modifiables dans /admin > Contenu du site > Textes du site */}\n${ind}<StorySection texts={siteTexts} />\n${m}`,
      "commentaire QUIZ COULEURS"
    );
    t = once(
      t,
      /^([ \t]*)<p><a href="\/confidentialite"[^\n]*<\/a><\/p>[ \t]*$/m,
      (m, ind) => `${m}\n${ind}{reviewsCfg.enabled && <p><a href="/charte-des-avis" className="hover:text-white underline-offset-2 hover:underline">Charte des avis</a></p>}`,
      "lien Politique de confidentialité du footer"
    );
    return t;
  },

  "components/AdminSiteMedia.js": (t) => {
    t = once(t, /^import AdminContact from [^\n]*;[ \t]*$/m, (m) => `${m}\nimport AdminLegalPages from "@/components/AdminLegalPages"; // ${MARK}`, "import AdminContact");
    t = once(
      t,
      /^([ \t]*)<AdminContact \/>[ \t]*$/m,
      (m, ind) => `${m}\n\n${ind}{/* AVIS CLIENTES (on/off, avec la charte) ET CONFIDENTIALITÉ (toujours en ligne) */}\n${ind}<AdminLegalPages />`,
      "<AdminContact />"
    );
    return t;
  },

  "pages/confidentialite.js": (t) => {
    t = once(
      t,
      /<Todo>région du projet Supabase et garanties de transfert<\/Todo>/,
      "Les données sont hébergées dans l&apos;Union européenne (Irlande, région eu-west-1). <Todo>garanties pour les éventuels transferts hors Union européenne</Todo>",
      "Todo région Supabase"
    );
    t = once(
      t,
      /^([ \t]*)<Section id="cookies"[^\n]*$/m,
      (m, ind) => PRIVACY_SECTIONS.map((l) => (l ? ind + l : "")).join("\n") + "\n" + m,
      "rubrique cookies"
    );
    return t;
  },
};

// ---------------- Exécution ----------------
try {
  console.log(`\nChantier Notre histoire + charte des avis${DRY ? " (VÉRIFICATION SEULE)" : ""}\n`);

  let branch = "";
  try { branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim(); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : passez d'abord sur ${BRANCH} (git switch ${BRANCH})`);
  ok(`branche ${BRANCH}`);

  const writes = [];

  // 1. Nouveaux fichiers
  const refEol = read("pages/index.js").eol;
  for (const [rel, content] of Object.entries(NEW_FILES)) {
    if (fs.existsSync(rel)) {
      const cur = read(rel).text;
      if (cur === content) { info(`${rel} : déjà présent, identique`); continue; }
      fail(`${rel} existe déjà avec un contenu différent : renommez-le ou supprimez-le, puis relancez`);
    }
    writes.push({ rel, data: refEol === "\r\n" ? content.replace(/\n/g, "\r\n") : content, label: "créé" });
  }

  // 2. Fichiers modifiés
  for (const [rel, patch] of Object.entries(PATCHES)) {
    const f = read(rel);
    if (f.text.includes(MARK)) { info(`${rel} : déjà modifié, laissé tel quel`); continue; }
    const next = patch(f.text);
    writes.push({ rel, data: toDisk(f, next), label: "modifié" });
  }

  ok("tous les repères ont été trouvés");
  if (DRY) { console.log(`\nVérification réussie : ${writes.length} fichier(s) seraient écrits. Rien n'a été modifié.\n`); process.exit(0); }

  for (const w of writes) {
    fs.mkdirSync(path.dirname(w.rel), { recursive: true });
    fs.writeFileSync(w.rel, w.data, "utf8");
    ok(`${w.rel} ${w.label}`);
  }
  console.log(`\nTerminé : ${writes.length} fichier(s) écrit(s). Suite : npm run build, puis git status -sb.\n`);
} catch (e) {
  if (e instanceof Stop) { console.error(`\n\u2717 ARRÊT : ${e.message}\nAucun fichier n'a été modifié.\n`); process.exit(1); }
  throw e;
}
