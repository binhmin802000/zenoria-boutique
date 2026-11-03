#!/usr/bin/env node
// ============================================================
// PATCH LOT 4b : écrans de l'annulation automatique des virements (à appliquer APRÈS le SQL lot4b_grace_apply.sql)
//  - lib/paymentSettings.js : délai de grâce (0 à 30 j, 2 par défaut) lu ET enregistré (sinon l'admin l'effacerait),
//    calcul de la date d'annulation et de la période d'alerte (au plus tôt : échéance dépassée / 24 h avant l'annulation)
//  - components/AdminPaymentMethods.js : champ « Délai de grâce avant annulation automatique », texte d'aide corrigé
//  - components/AdminCrm.js : « Annulation automatique le … », passage au rouge pendant l'alerte (plus de seuil fixe de 5 j),
//    annulation par le système affichée « automatiquement (virement non reçu) »
//  - pages/compte.js : bandeau rouge vif (accueil et détail de la commande), texte validé
//  - components/TransferInstructions.js, pages/index.js : « sera annulée automatiquement »
//   node scripts/patch-lot4b-alerte.mjs --dry-run
//   node scripts/patch-lot4b-alerte.mjs --apply
// ============================================================
import fs from "node:fs";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/paymentSettings.js",
  "done": "export function isAutoCancelAlert",
  "patches": [
   {
    "name": "PS1 bornes du delai de grace",
    "find": [
     "export const DELAY_MAX = 60;"
    ],
    "replace": [
     "export const DELAY_MAX = 60;",
     "export const GRACE_MIN = 0; // ZENORIA_AUTO_CANCEL_UI_V1 : délai de grâce avant annulation automatique (0 = dès l'échéance)",
     "export const GRACE_MAX = 30;"
    ]
   },
   {
    "name": "PS2 valeur par defaut (2 jours)",
    "find": [
     "export const DEFAULT_BANK_TRANSFER = Object.freeze({ beneficiary: \"\", iban: \"\", bic: \"\", delay_days: 3 });"
    ],
    "replace": [
     "export const DEFAULT_BANK_TRANSFER = Object.freeze({ beneficiary: \"\", iban: \"\", bic: \"\", delay_days: 3, grace_days: 2 });"
    ]
   },
   {
    "name": "PS3 lecture du delai de grace",
    "find": [
     "delay_days: Number.isInteger(d) && d >= DELAY_MIN && d <= DELAY_MAX ? d : DEFAULT_BANK_TRANSFER.delay_days,"
    ],
    "replace": [
     "    delay_days: Number.isInteger(d) && d >= DELAY_MIN && d <= DELAY_MAX ? d : DEFAULT_BANK_TRANSFER.delay_days,",
     "    grace_days: typeof v.grace_days === \"number\" && Number.isInteger(v.grace_days) && v.grace_days >= GRACE_MIN && v.grace_days <= GRACE_MAX ? v.grace_days : DEFAULT_BANK_TRANSFER.grace_days,"
    ]
   },
   {
    "name": "PS4 enregistrement : le delai de grace n'est plus efface",
    "find": [
     "delay_days: Number(d.delay_days),"
    ],
    "replace": [
     "    delay_days: Number(d.delay_days),",
     "    grace_days: Number(d.grace_days),"
    ]
   },
   {
    "name": "PS5 comparaison",
    "find": [
     "String(x.delay_days) === String(y.delay_days);"
    ],
    "replace": [
     "String(x.delay_days) === String(y.delay_days) && String(x.grace_days) === String(y.grace_days);"
    ]
   },
   {
    "name": "PS6 fonctions du delai de grace et de l'alerte",
    "find": [
     "export function isValidDelay(v) {"
    ],
    "replace": [
     "// ZENORIA_AUTO_CANCEL_UI_V1 : délai de grâce avant l'annulation automatique (lot 4a) et alerte affichée avant cette annulation.",
     "// Règle d'affichage validée : l'alerte apparaît au plus tôt de « échéance dépassée » et « 24 heures avant l'annulation ».",
     "export function isValidGrace(v) {",
     "  const n = Number(v);",
     "  return v !== \"\" && v !== null && v !== undefined && Number.isInteger(n) && n >= GRACE_MIN && n <= GRACE_MAX;",
     "}",
     "function graceOrDefault(graceDays) {",
     "  return typeof graceDays === \"number\" && Number.isInteger(graceDays) && graceDays >= GRACE_MIN && graceDays <= GRACE_MAX",
     "    ? graceDays",
     "    : DEFAULT_BANK_TRANSFER.grace_days;",
     "}",
     "export function autoCancelAt(dueAt, graceDays) {",
     "  if (!dueAt) return null;",
     "  const t = new Date(dueAt).getTime();",
     "  if (!Number.isFinite(t)) return null;",
     "  return new Date(t + graceOrDefault(graceDays) * 86400000);",
     "}",
     "export function isAutoCancelAlert(dueAt, graceDays, now = Date.now()) {",
     "  const cancel = autoCancelAt(dueAt, graceDays);",
     "  if (!cancel) return false;",
     "  const start = Math.min(new Date(dueAt).getTime(), cancel.getTime() - 86400000);",
     "  return Number(now) >= start;",
     "}",
     "export function formatAutoCancel(date) {",
     "  if (!date) return \"\";",
     "  const day = date.toLocaleDateString(\"fr-FR\", { timeZone: \"Europe/Paris\", day: \"2-digit\", month: \"2-digit\", year: \"numeric\" });",
     "  const time = date.toLocaleTimeString(\"fr-FR\", { timeZone: \"Europe/Paris\", hour: \"2-digit\", minute: \"2-digit\" }).replace(\":\", \" h \");",
     "  return day + \" à \" + time;",
     "}",
     "export function isValidDelay(v) {"
    ]
   }
  ]
 },
 {
  "path": "components/AdminPaymentMethods.js",
  "done": "isValidGrace(draft.grace_days)",
  "patches": [
   {
    "name": "AP1 imports",
    "find": [
     "isValidDelay,"
    ],
    "replace": [
     "  isValidDelay,",
     "  isValidGrace, // ZENORIA_AUTO_CANCEL_UI_V1",
     "  GRACE_MIN,",
     "  GRACE_MAX,"
    ]
   },
   {
    "name": "AP2 validation du champ",
    "find": [
     "const delayInvalid = !isValidDelay(draft.delay_days);"
    ],
    "replace": [
     "  const delayInvalid = !isValidDelay(draft.delay_days);",
     "  const graceInvalid = !isValidGrace(draft.grace_days);"
    ]
   },
   {
    "name": "AP3 controle a l'enregistrement",
    "find": [
     "if (delayInvalid) {",
     "setError(\"Le délai de paiement doit être un nombre entier de jours, entre \" + DELAY_MIN + \" et \" + DELAY_MAX + \".\");",
     "return;",
     "}"
    ],
    "replace": [
     "    if (delayInvalid) {",
     "      setError(\"Le délai de paiement doit être un nombre entier de jours, entre \" + DELAY_MIN + \" et \" + DELAY_MAX + \".\");",
     "      return;",
     "    }",
     "    if (graceInvalid) {",
     "      setError(\"Le délai de grâce doit être un nombre entier de jours, entre \" + GRACE_MIN + \" et \" + GRACE_MAX + \".\");",
     "      return;",
     "    }"
    ]
   },
   {
    "name": "AP4 champ « délai de grâce »",
    "find": [
     "{delayInvalid && <div className=\"text-[11px] text-red-600 mt-1\">Entier entre {DELAY_MIN} et {DELAY_MAX}.</div>}",
     "</div>"
    ],
    "replace": [
     "            {delayInvalid && <div className=\"text-[11px] text-red-600 mt-1\">Entier entre {DELAY_MIN} et {DELAY_MAX}.</div>}",
     "          </div>",
     "          <div>",
     "            <label className=\"text-xs text-[#54434c] font-medium\" htmlFor=\"bt_grace\">Délai de grâce avant annulation automatique (jours)</label>",
     "            <input",
     "              id=\"bt_grace\"",
     "              type=\"number\"",
     "              min={GRACE_MIN}",
     "              max={GRACE_MAX}",
     "              step={1}",
     "              value={draft.grace_days}",
     "              disabled={disabled}",
     "              onChange={(e) => setField(\"grace_days\", e.target.value)}",
     "              aria-invalid={graceInvalid}",
     "              data-testid=\"payment-grace\"",
     "              className={inputCls + (graceInvalid ? \" border-red-300\" : \"\")}",
     "            />",
     "            {graceInvalid && <div className=\"text-[11px] text-red-600 mt-1\">Entier entre {GRACE_MIN} et {GRACE_MAX} (0 = dès l&apos;échéance).</div>}",
     "          </div>"
    ]
   },
   {
    "name": "AP5 texte d'aide",
    "find": [
     "Date limite de paiement <b>indicative</b> : aucune annulation automatique. Elle est affichée à la cliente et vous sert de repère de relance."
    ],
    "replace": [
     "Date limite de paiement affichée à la cliente. Sans virement reçu, la commande est <b>annulée automatiquement</b> une fois le délai de grâce écoulé après cette date (vérification toutes les heures), et ses bijoux sont remis en vente."
    ]
   },
   {
    "name": "AP6 bouton Enregistrer",
    "find": [
     "disabled={disabled || !dirty || ibanInvalid || bicInvalid || delayInvalid}"
    ],
    "replace": [
     "disabled={disabled || !dirty || ibanInvalid || bicInvalid || delayInvalid || graceInvalid}"
    ]
   }
  ]
 },
 {
  "path": "components/AdminCrm.js",
  "done": "ZENORIA_AUTO_CANCEL_UI_V1",
  "patches": [
   {
    "name": "AC1 import",
    "find": [
     "import { parseBankTransfer, BANK_TRANSFER_KEY } from \"@/lib/paymentSettings\"; // ZENORIA_ADMIN_TRANSFER_V1"
    ],
    "replace": [
     "import { parseBankTransfer, BANK_TRANSFER_KEY, DEFAULT_BANK_TRANSFER, autoCancelAt, isAutoCancelAlert, formatAutoCancel } from \"@/lib/paymentSettings\"; // ZENORIA_ADMIN_TRANSFER_V1 · ZENORIA_AUTO_CANCEL_UI_V1"
    ]
   },
   {
    "name": "AC2 plus de seuil fixe de 5 jours",
    "find": [
     "const TRANSFER_LATE_DAYS = 5; // l'etat passe en rouge (\"En retard\") a partir de 5 jours apres l'echeance"
    ],
    "replace": [
     "// ZENORIA_AUTO_CANCEL_UI_V1 : l'etat passe en rouge pendant la periode d'alerte avant l'annulation automatique (plus de seuil fixe de 5 jours)"
    ]
   },
   {
    "name": "AC3 etat de l'echeance selon le delai de grace",
    "find": [
     "function transferDueState(order, now) {",
     "if (!order.transfer_due_at) return null;",
     "const left = parisDayDiff(parisDay(now), parisDay(order.transfer_due_at)); // jours restants jusqu'au jour d'échéance",
     "if (left >= 0) {",
     "return { level: \"ok\", label: \"En attente\", detail: left === 0 ? \"échéance aujourd'hui\" : \"échéance dans \" + left + \" jour\" + (left > 1 ? \"s\" : \"\") };",
     "}",
     "const late = -left;",
     "const detail = \"échéance dépassée de \" + late + \" jour\" + (late > 1 ? \"s\" : \"\");",
     "if (late >= TRANSFER_LATE_DAYS) return { level: \"late\", label: \"En retard\", detail };",
     "return { level: \"over\", label: \"Échéance dépassée\", detail };",
     "}"
    ],
    "replace": [
     "function transferDueState(order, now, graceDays) {",
     "  if (!order.transfer_due_at) return null;",
     "  const left = parisDayDiff(parisDay(now), parisDay(order.transfer_due_at)); // jours restants jusqu'au jour d'échéance",
     "  const alert = isAutoCancelAlert(order.transfer_due_at, graceDays, now);",
     "  if (left >= 0) {",
     "    const detail = left === 0 ? \"échéance aujourd'hui\" : \"échéance dans \" + left + \" jour\" + (left > 1 ? \"s\" : \"\");",
     "    return alert ? { level: \"late\", label: \"Annulation imminente\", detail } : { level: \"ok\", label: \"En attente\", detail };",
     "  }",
     "  const late = -left;",
     "  const detail = \"échéance dépassée de \" + late + \" jour\" + (late > 1 ? \"s\" : \"\");",
     "  return alert ? { level: \"late\", label: \"En retard\", detail } : { level: \"over\", label: \"Échéance dépassée\", detail };",
     "}"
    ]
   },
   {
    "name": "AC4 delai de grace transmis au panneau",
    "find": [
     "function TransferPanel({ order, history, onDone }) {"
    ],
    "replace": [
     "function TransferPanel({ order, history, onDone, graceDays }) {"
    ]
   },
   {
    "name": "AC5 annulation par le systeme : motif",
    "find": [
     ".replace(/^Annulée par la cliente depuis Mes commandes\\.\\s*/i, \"\") : \"\";"
    ],
    "replace": [
     ".replace(/^Annulée par la cliente depuis Mes commandes\\.\\s*/i, \"\").replace(/^Annulée automatiquement\\s*:\\s*/i, \"Motif : \") : \"\";"
    ]
   },
   {
    "name": "AC6 annulation par le systeme : auteur",
    "find": [
     "{order.cancelled_by === \"customer\" ? \"par la cliente\" : order.cancelled_by === \"admin\" ? \"par l'administration\" : \"\"}."
    ],
    "replace": [
     "{order.cancelled_by === \"customer\" ? \"par la cliente\" : order.cancelled_by === \"admin\" ? \"par l'administration\" : order.cancelled_by === \"system\" ? \"automatiquement (virement non reçu)\" : \"\"}."
    ]
   },
   {
    "name": "AC7 etat calcule avec le delai de grace",
    "find": [
     "const state = transferDueState(order, Date.now());"
    ],
    "replace": [
     "  const state = transferDueState(order, Date.now(), graceDays);",
     "  const cancelAt = autoCancelAt(order.transfer_due_at, graceDays);"
    ]
   },
   {
    "name": "AC8 ligne « annulation automatique le … »",
    "find": [
     "<br />Échéance : {formatDateOnly(order.transfer_due_at)}{state ? \" (\" + state.detail + \")\" : \"\"}"
    ],
    "replace": [
     "            <br />Échéance : {formatDateOnly(order.transfer_due_at)}{state ? \" (\" + state.detail + \")\" : \"\"}",
     "            {cancelAt && (",
     "              <span data-testid=\"transfer-auto-cancel\" className={\"block mt-0.5 \" + (state && state.level === \"late\" ? \"text-[#b42318] font-semibold\" : \"text-[#8b737e]\")}>Annulation automatique le {formatAutoCancel(cancelAt)} si aucun virement n&apos;est reçu</span>",
     "            )}"
    ]
   },
   {
    "name": "AC9 delai de grace : etat",
    "find": [
     "const [includeTestData, setIncludeTestData] = useState(false);"
    ],
    "replace": [
     "  const [includeTestData, setIncludeTestData] = useState(false);",
     "  const [graceDays, setGraceDays] = useState(DEFAULT_BANK_TRANSFER.grace_days);"
    ]
   },
   {
    "name": "AC10 delai de grace : lecture (resultat)",
    "find": [
     "{ data: productsData },",
     "] = await Promise.all(["
    ],
    "replace": [
     "      { data: productsData },",
     "      bankRes,",
     "    ] = await Promise.all(["
    ]
   },
   {
    "name": "AC11 delai de grace : lecture (requete)",
    "find": [
     "supabase.from(\"products\").select(\"id, photos, slug, color, stone\"),",
     "]);"
    ],
    "replace": [
     "      supabase.from(\"products\").select(\"id, photos, slug, color, stone\"),",
     "      supabase.from(\"site_settings\").select(\"value\").eq(\"key\", BANK_TRANSFER_KEY).maybeSingle(),",
     "    ]);"
    ]
   },
   {
    "name": "AC12 delai de grace : memorisation",
    "find": [
     "setProductsById(Object.fromEntries((productsData || []).map((p) => [p.id, p])));"
    ],
    "replace": [
     "    setProductsById(Object.fromEntries((productsData || []).map((p) => [p.id, p])));",
     "    setGraceDays(parseBankTransfer(bankRes && !bankRes.error && bankRes.data ? bankRes.data.value : null).grace_days);"
    ]
   },
   {
    "name": "AC13 panneau du virement",
    "find": [
     "<TransferPanel order={o} history={statusHistoryByOrder[o.id]} onDone={(msg) => { setAdminNotice(msg); load(); }} />"
    ],
    "replace": [
     "<TransferPanel order={o} history={statusHistoryByOrder[o.id]} graceDays={graceDays} onDone={(msg) => { setAdminNotice(msg); load(); }} />"
    ]
   }
  ]
 },
 {
  "path": "components/TransferInstructions.js",
  "done": "ZENORIA_AUTO_CANCEL_UI_V1",
  "patches": [
   {
    "name": "TI1 repere",
    "find": [
     "// ZENORIA_STEP3C_V1"
    ],
    "replace": [
     "// ZENORIA_STEP3C_V1 · ZENORIA_AUTO_CANCEL_UI_V1"
    ]
   },
   {
    "name": "TI2 texte d'echeance (validé : « automatiquement » avec l'étape 4)",
    "find": [
     "Au-delà, la commande pourra être annulée."
    ],
    "replace": [
     "Au-delà, la commande sera annulée automatiquement."
    ]
   }
  ]
 },
 {
  "path": "pages/compte.js",
  "done": "ZENORIA_AUTO_CANCEL_UI_V1",
  "patches": [
   {
    "name": "CP1 icone d'alerte",
    "find": [
     "import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut, Truck, ChevronLeft, FileDown } from \"lucide-react\";"
    ],
    "replace": [
     "import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut, Truck, ChevronLeft, FileDown, AlertTriangle } from \"lucide-react\";"
    ]
   },
   {
    "name": "CP2 fonctions de l'alerte",
    "find": [
     "import { getAvailability, pieceStateMap, stockStateMap } from \"@/lib/shopUtils\";"
    ],
    "replace": [
     "import { getAvailability, pieceStateMap, stockStateMap } from \"@/lib/shopUtils\";",
     "import { autoCancelAt, isAutoCancelAlert, formatAutoCancel, DEFAULT_BANK_TRANSFER } from \"@/lib/paymentSettings\"; // ZENORIA_AUTO_CANCEL_UI_V1"
    ]
   },
   {
    "name": "CP3 bandeau d'alerte + delai transmis au detail",
    "find": [
     "function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onOrderChanged }) {"
    ],
    "replace": [
     "// ZENORIA_AUTO_CANCEL_UI_V1 : bandeau rouge vif avant l'annulation automatique d'une commande par virement (texte validé)",
     "function AutoCancelAlert({ order, graceDays }) {",
     "  if (!order || order.status !== \"pending_transfer\" || !order.transfer_due_at) return null;",
     "  if (!isAutoCancelAlert(order.transfer_due_at, graceDays)) return null;",
     "  const at = autoCancelAt(order.transfer_due_at, graceDays);",
     "  return (",
     "    <div role=\"alert\" data-testid=\"auto-cancel-alert\" className=\"flex gap-2.5 rounded-xl border-2 border-[#e5484d] bg-[#fdecec] px-4 py-3 text-sm leading-5 text-[#b42318]\">",
     "      <AlertTriangle size={18} className=\"shrink-0 mt-0.5\" aria-hidden=\"true\" />",
     "      <span>",
     "        Votre virement n&apos;a pas encore été reçu. Sans réception avant le <strong>{formatAutoCancel(at)}</strong>, votre commande sera annulée automatiquement et votre bijou remis en vente.",
     "      </span>",
     "    </div>",
     "  );",
     "}",
     "function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onOrderChanged, graceDays }) {"
    ]
   },
   {
    "name": "CP4 bandeau dans le detail",
    "find": [
     "<TransferInstructions orderId={order.id} contactCfg={contactCfg} />"
    ],
    "replace": [
     "          <AutoCancelAlert order={order} graceDays={graceDays} />",
     "          <TransferInstructions orderId={order.id} contactCfg={contactCfg} />"
    ]
   },
   {
    "name": "CP5 delai de grace : etat",
    "find": [
     "const [ordersVersion, setOrdersVersion] = useState(0);"
    ],
    "replace": [
     "  const [ordersVersion, setOrdersVersion] = useState(0);",
     "  const [graceDays, setGraceDays] = useState(DEFAULT_BANK_TRANSFER.grace_days); // ZENORIA_AUTO_CANCEL_UI_V1"
    ]
   },
   {
    "name": "CP6 delai de grace : lecture (resultat)",
    "find": [
     "const [ordersRes, contactRes, reviewRes] = await Promise.all(["
    ],
    "replace": [
     "      const [ordersRes, contactRes, reviewRes, graceRes] = await Promise.all(["
    ]
   },
   {
    "name": "CP7 delai de grace : lecture (requete)",
    "find": [
     "supabase.rpc(\"list_reviewable_items\"),",
     "]);"
    ],
    "replace": [
     "        supabase.rpc(\"list_reviewable_items\"),",
     "        supabase.rpc(\"transfer_grace_days\"),",
     "      ]);"
    ]
   },
   {
    "name": "CP8 delai de grace : memorisation",
    "find": [
     "setReviewItems((reviewRes && !reviewRes.error && reviewRes.data) || []);"
    ],
    "replace": [
     "      setReviewItems((reviewRes && !reviewRes.error && reviewRes.data) || []);",
     "      if (graceRes && !graceRes.error && typeof graceRes.data === \"number\") setGraceDays(graceRes.data);"
    ]
   },
   {
    "name": "CP9 bandeau sur l'accueil",
    "find": [
     "<div className=\"text-sm text-[#54434c]\">Commande {o.reference} · {formatOrderPrice(o.total)}{o.transfer_due_at ? <> · à régler avant le {formatDate(o.transfer_due_at)}</> : null}</div>"
    ],
    "replace": [
     "                      <div className=\"text-sm text-[#54434c]\">Commande {o.reference} · {formatOrderPrice(o.total)}{o.transfer_due_at ? <> · à régler avant le {formatDate(o.transfer_due_at)}</> : null}</div>",
     "                      {isAutoCancelAlert(o.transfer_due_at, graceDays) && <div className=\"mt-2\"><AutoCancelAlert order={o} graceDays={graceDays} /></div>}"
    ]
   },
   {
    "name": "CP10 delai transmis au detail",
    "find": [
     "onOrderChanged={() => { setSelectedOrderId(null); setOrdersVersion((v) => v + 1); }} // ZENORIA_STEP3C2_V1"
    ],
    "replace": [
     "                      onOrderChanged={() => { setSelectedOrderId(null); setOrdersVersion((v) => v + 1); }} // ZENORIA_STEP3C2_V1",
     "                      graceDays={graceDays}"
    ]
   }
  ]
 },
 {
  "path": "pages/index.js",
  "done": "la commande sera annulée automatiquement et les pièces",
  "patches": [
   {
    "name": "IX1 recapitulatif du virement",
    "find": [
     "la commande pourra être annulée et les pièces remises en vente."
    ],
    "replace": [
     "la commande sera annulée automatiquement et les pièces remises en vente."
    ]
   }
  ]
 }
];
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(esc(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = []; const problems = [];
for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(f.done)) fail(f.path + " : le patch est deja applique.");
  const before = problems.length;
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(f.path + " : " + p.name + " (" + c + " occurrence(s) au lieu de 1)"); }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) if (!r.content.includes(r.f.done)) fail("controle final " + r.f.path + " : marqueur absent apres patch.");
const ac = results.find((r) => r.f.path === "components/AdminCrm.js");
if (ac && ac.content.includes("TRANSFER_LATE_DAYS")) fail("controle final : TRANSFER_LATE_DAYS encore utilise dans AdminCrm.js.");
if (mode === "dry") { console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Retour arriere avant commit : git restore " + FILES.map((f) => f.path).join(" "));
