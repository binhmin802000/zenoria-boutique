// ZENORIA - Lot 3a (correctif definitif) : prise en compte de payment_methods
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "index.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const hasCRLF = /\r\n/.test(original);
const EOL = hasCRLF ? "\r\n" : "\n";

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

let text = original;

function replaceOnce(label, oldStr, newStr) {
  const count = countSubstring(text, oldStr);
  if (count !== 1) {
    fail(`${label} : attendu 1 occurrence exacte, trouve ${count}.\nRecherche : ${JSON.stringify(oldStr)}`);
  }
  text = text.replace(oldStr, newStr);
  console.log(`OK repere : ${label}`);
}

// A — Import de PAYMENT_METHODS_KEY/parsePaymentMethods
replaceOnce(
  "import paymentSettings",
  'import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting, qualifiesForFreeShipping, shippingStripText } from "@/lib/shippingSettings";',
  'import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting, qualifiesForFreeShipping, shippingStripText } from "@/lib/shippingSettings";' + EOL +
  'import { PAYMENT_METHODS_KEY, DEFAULT_PAYMENT_METHODS, parsePaymentMethods } from "@/lib/paymentSettings";'
);

// B — Ajoute PAYMENT_METHODS_KEY a la requete groupee
replaceOnce(
  "ajout de PAYMENT_METHODS_KEY a la requete groupee",
  '.in("key", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY])',
  '.in("key", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY, PAYMENT_METHODS_KEY])'
);

// C — Extrait paymentRow et applique setPaymentMethodsCfg, juste apres shipRow
replaceOnce(
  "extraction et application de payment_methods",
  '      const shipRow = settingRows.find((r) => r.key === SHIPPING_KEY) || null;',
  '      const shipRow = settingRows.find((r) => r.key === SHIPPING_KEY) || null;' + EOL +
  '      const paymentRow = settingRows.find((r) => r.key === PAYMENT_METHODS_KEY) || null;' + EOL +
  '      setPaymentMethodsCfg(parsePaymentMethods(paymentRow ? paymentRow.value : null));'
);

// D — Etat paymentMethodsCfg, juste apres l'etat paymentMethod
replaceOnce(
  "etat paymentMethodsCfg",
  'const [paymentMethod, setPaymentMethod] = useState("card");',
  'const [paymentMethod, setPaymentMethod] = useState("card");' + EOL +
  '  const [paymentMethodsCfg, setPaymentMethodsCfg] = useState(DEFAULT_PAYMENT_METHODS);'
);

// E — Effet d'auto-selection si un seul moyen actif
replaceOnce(
  "effet d'auto-selection",
  '  const [paymentMethodsCfg, setPaymentMethodsCfg] = useState(DEFAULT_PAYMENT_METHODS);',
  '  const [paymentMethodsCfg, setPaymentMethodsCfg] = useState(DEFAULT_PAYMENT_METHODS);' + EOL +
  '  useEffect(() => {' + EOL +
  '    if (paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled) setPaymentMethod("card");' + EOL +
  '    else if (!paymentMethodsCfg.stripe_enabled && paymentMethodsCfg.transfer_enabled) setPaymentMethod("transfer");' + EOL +
  '  }, [paymentMethodsCfg.stripe_enabled, paymentMethodsCfg.transfer_enabled]);'
);

// F — Bouton carte : disabled lie a stripe_enabled
replaceOnce(
  "bouton carte — disabled",
  'onClick={() => { setPaymentMethod("card"); setCheckoutError(""); }}',
  'disabled={!paymentMethodsCfg.stripe_enabled}' + EOL +
  '                      onClick={() => { if (paymentMethodsCfg.stripe_enabled) { setPaymentMethod("card"); setCheckoutError(""); } }}'
);

// G — Bouton virement : disabled lie a transfer_enabled
replaceOnce(
  "bouton virement — disabled",
  'onClick={() => { setPaymentMethod("transfer"); setCheckoutError(""); }}',
  'disabled={!paymentMethodsCfg.transfer_enabled}' + EOL +
  '                      onClick={() => { if (paymentMethodsCfg.transfer_enabled) { setPaymentMethod("transfer"); setCheckoutError(""); } }}'
);

// H — Classe visuelle du bouton carte (grise si desactive)
replaceOnce(
  "classe du bouton carte",
  'className={`rounded-xl border px-3 py-2 text-sm text-left transition ${paymentMethod === "card" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}`}',
  'className={`rounded-xl border px-3 py-2 text-sm text-left transition ${!paymentMethodsCfg.stripe_enabled ? "border-[#eee2e5] text-[#b7adaf] bg-[#fbf8f4] cursor-not-allowed" : paymentMethod === "card" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}`}'
);

// I — Classe visuelle du bouton virement (grise si desactive)
replaceOnce(
  "classe du bouton virement",
  'className={`rounded-xl border px-3 py-2 text-sm text-left transition ${paymentMethod === "transfer" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}`}',
  'className={`rounded-xl border px-3 py-2 text-sm text-left transition ${!paymentMethodsCfg.transfer_enabled ? "border-[#eee2e5] text-[#b7adaf] bg-[#fbf8f4] cursor-not-allowed" : paymentMethod === "transfer" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}`}'
);

// J — Message si aucun moyen de paiement disponible, avant le garde-fou connexion
replaceOnce(
  "message aucun moyen de paiement",
  '{paymentMethod === "transfer" && !user && (',
  '{!paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled && (' + EOL +
  '                    <div data-testid="no-payment-method-available" className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[12px] text-amber-900 leading-5">' + EOL +
  '                      Aucun moyen de paiement n\'est disponible actuellement. Merci de réessayer plus tard ou de nous contacter.' + EOL +
  '                    </div>' + EOL +
  '                  )}' + EOL +
  '                  {paymentMethod === "transfer" && !user && ('
);

// K — Texte "Paiement securise via Stripe." conditionne a paymentMethod==="card"
replaceOnce(
  "texte Stripe conditionne",
  '<p className="text-[11px] text-center text-[#7e7378]">Paiement sécurisé via Stripe.</p>',
  '{paymentMethod === "card" && <p className="text-[11px] text-center text-[#7e7378]">Paiement sécurisé via Stripe.</p>}'
);

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
if (countSubstring(text, "paymentMethodsCfg") < 8) {
  fail(`garde-fou final : attendu au moins 8 occurrences de "paymentMethodsCfg", trouve ${countSubstring(text, "paymentMethodsCfg")}.`);
}
if (countSubstring(text, 'data-testid="no-payment-method-available"') !== 1) fail("garde-fou final : message aucun moyen disponible absent ou en double.");
if (countSubstring(text, 'data-testid="payment-method-card"') !== 1) fail("garde-fou final : bouton carte disparu ou en double.");
if (countSubstring(text, 'data-testid="payment-method-transfer"') !== 1) fail("garde-fou final : bouton virement disparu ou en double.");
if (countSubstring(text, 'data-testid="cgv-checkbox"') !== 1) fail("garde-fou final : case CGV disparue.");
if (countSubstring(text, 'data-testid="checkout-button"') !== 1) fail("garde-fou final : bouton Commander disparu.");
console.log("OK garde-fou : payment_methods integre, boutons et textes existants intacts");

if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");

if (dryRun) {
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}