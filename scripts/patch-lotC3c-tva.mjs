// scripts/patch-lotC3c-tva.mjs  (lot C3c : interrupteur sensible « Assujettie à la TVA »)
// Usage : node scripts/patch-lotC3c-tva.mjs [--dry-run]
// Fichiers : lib/billingActions.js (nouveau), lib/configOverview.js, components/AdminConfig.js
// Securite : chaque ancre doit etre trouvee EXACTEMENT une fois, sinon rien n'est ecrit.
import fs from "fs";

const DRY = process.argv.includes("--dry-run");
const MARK = "ZENORIA_CONFIG_C3C_V1";

const NEW_FILE = "lib/billingActions.js";
const NEW_CONTENT = String.raw`// lib/billingActions.js
// ZENORIA_CONFIG_C3C_V1
//
// Ecriture de l'interrupteur « Assujettie a la TVA » (cle "billing", champ vat_enabled).
// Utilisee par components/AdminConfig.js via SensitiveSwitch (confirmation "BINHEMI").
// Regles : on relit la valeur en base juste avant d'ecrire (pas de valeur perimee), on ne
// change QUE vat_enabled, les autres champs sont conserves. Les factures deja emises ne sont
// jamais touchees (elles sont figees dans la table invoices, voir lib/billingSettings.js).
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { BILLING_KEY, parseBillingSetting, billingMissingFields } from "@/lib/billingSettings";

// true  : l'activation est refusee tant que l'identite du vendeur est incomplete
//         (SIRET, adresse, n° de TVA intracommunautaire... selon billingMissingFields).
// false : l'activation est toujours permise (l'avertissement du panneau reste affiche).
export const BLOCK_ON_MISSING = true;

export class VatNotReadyError extends Error {}

// next : bool, valeur cible. Retourne la valeur ecrite, ou leve une erreur.
export async function setVatEnabled(next) {
  const { data, error: readError } = await supabase
    .from(SITE_SETTINGS_TABLE)
    .select("value")
    .eq("key", BILLING_KEY)
    .maybeSingle();
  if (readError) throw readError;
  if (!data) throw new Error("Le réglage de facturation est introuvable : le réglage n'a pas été modifié.");

  const raw = data.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value : {};
  const parsed = parseBillingSetting(raw);

  if (next && BLOCK_ON_MISSING) {
    const missing = billingMissingFields({ ...parsed, vat_enabled: true });
    if (missing.length) {
      throw new VatNotReadyError(
        "Pour activer la TVA, complétez d'abord dans Facturation et TVA : " + missing.join(", ") + "."
      );
    }
  }

  const value = { ...raw, ...parsed, vat_enabled: next };
  const { error } = await supabase
    .from(SITE_SETTINGS_TABLE)
    .upsert({ key: BILLING_KEY, value }, { onConflict: "key" });
  if (error) throw error;
  return value;
}
`;

const VAT_WARNING_BLOCK = [
  "// " + MARK + " : la TVA est un reglage sensible (confirmation \"BINHEMI\"), avertissement selon le sens du changement",
  "  const vatIsOn = bl ? bl.vat_enabled === true : false;",
  "  const vatMissing = bl ? billingMissingFields({ ...parseBillingSetting(bl), vat_enabled: true }) : [];",
  "  const vatWarning = !bl",
  "    ? undefined",
  "    : vatIsOn",
  "    ? \"Les factures déjà émises ne seront pas modifiées. Les nouvelles factures seront émises sans TVA (mention « TVA non applicable, art. 293 B du CGI »).\"",
  "    : \"Les factures déjà émises ne seront pas modifiées. Les nouvelles factures indiqueront une TVA de \" + (vatRate === null ? \"le taux enregistré\" : vatRate + \" %\") + \" incluse dans les prix affichés (les prix ne changent pas).\" +",
  "      (vatMissing.length ? \" À compléter avant activation dans Facturation et TVA : \" + vatMissing.join(\", \") + \".\" : \"\");",
  "  ",
].join("\n");

const EDITS = [
  {
    file: "lib/configOverview.js",
    label: "import des helpers de facturation",
    from: 'import { isTransferReady } from "@/lib/paymentSettings";',
    to: 'import { parseBillingSetting, billingMissingFields } from "@/lib/billingSettings"; // ' + MARK + '\nimport { isTransferReady } from "@/lib/paymentSettings";',
  },
  {
    file: "lib/configOverview.js",
    label: "avertissement TVA (avant la liste Facturation)",
    from: "const billing = [",
    to: VAT_WARNING_BLOCK + "const billing = [",
  },
  {
    file: "lib/configOverview.js",
    label: "ligne TVA marquee sensible",
    from: '{ id: "vat", label: "Assujettie à la TVA", flag: bl ? flag(bl.vat_enabled) : null,',
    to: '{ id: "vat", label: "Assujettie à la TVA", flag: bl ? flag(bl.vat_enabled) : null, sensitive: true, warningText: vatWarning,',
  },
  {
    file: "components/AdminConfig.js",
    label: "import de setVatEnabled",
    from: 'import { setPaymentMethod, TransferNotReadyError } from "@/lib/paymentActions";',
    to: 'import { setVatEnabled } from "@/lib/billingActions"; // ' + MARK + '\nimport { setPaymentMethod, TransferNotReadyError } from "@/lib/paymentActions";',
  },
  {
    file: "components/AdminConfig.js",
    label: "branche TVA dans handleSensitiveConfirm",
    from: 'if (id === "stripe" || id === "transfer") {',
    to: 'if (id === "vat") { // ' + MARK + "\n      await setVatEnabled(next);\n      cfg.reload();\n      return;\n    }\n    if (id === \"stripe\" || id === \"transfer\") {",
  },
];

const count = (s, sub) => s.split(sub).length - 1;
const files = {};
let ok = true;

for (const f of [...new Set(EDITS.map((e) => e.file))]) {
  if (!fs.existsSync(f)) { console.error("Introuvable : " + f); ok = false; continue; }
  const raw = fs.readFileSync(f, "utf8");
  files[f] = { crlf: raw.includes("\r\n"), src: raw.replace(/\r\n/g, "\n"), already: raw.includes(MARK) };
}
if (!ok) process.exit(1);
if (Object.values(files).some((x) => x.already) || fs.existsSync(NEW_FILE)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}

for (const e of EDITS) {
  const n = count(files[e.file].src, e.from);
  if (n !== 1) { console.error("KO (" + n + " occurrence(s), attendu 1) : " + e.file + " — " + e.label); ok = false; }
}
if (!ok) { console.error("Rien n'a ete ecrit."); process.exit(1); }

for (const e of EDITS) {
  files[e.file].src = files[e.file].src.replace(e.from, () => e.to);
  console.log("OK : " + e.file + " — " + e.label);
}
console.log("OK : " + NEW_FILE + " (nouveau)");

if (DRY) { console.log("DRY-RUN : aucune ecriture."); process.exit(0); }
for (const [f, x] of Object.entries(files)) fs.writeFileSync(f, x.crlf ? x.src.replace(/\n/g, "\r\n") : x.src);
fs.writeFileSync(NEW_FILE, NEW_CONTENT.replace(/\n/g, "\r\n"));
console.log("Ecrit : " + Object.keys(files).join(", ") + ", " + NEW_FILE);
