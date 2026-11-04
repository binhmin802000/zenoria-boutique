#!/usr/bin/env node
// scripts/patch-lotC3b-stripe-virement.mjs
// Lot C3-b — Interrupteurs sensibles Stripe & Virement dans l'onglet Configuration
//
// Usage :
//   node scripts/patch-lotC3b-stripe-virement.mjs --dry-run   (vérifie uniquement, AUCUNE écriture disque)
//   node scripts/patch-lotC3b-stripe-virement.mjs             (applique les changements)
//
// Ce que fait ce patch :
//   1. Crée lib/paymentActions.js (NOUVEAU) : fonction setPaymentMethod() partagée, qui réutilise
//      le même garde-fou isTransferReady() que AdminPaymentMethods.js. lib/paymentSettings.js
//      reste volontairement "sans dépendance" (commentaire d'origine) : la dépendance à supabase
//      est isolée dans ce nouveau fichier, pas ajoutée à paymentSettings.js.
//   2. Modifie components/AdminPaymentMethods.js : la fonction setMethod() appelle désormais
//      setPaymentMethod() au lieu d'écrire l'upsert en dur. Comportement inchangé (mêmes messages,
//      même validation, même toast), simplement la logique d'écriture est désormais partagée.
//   3. Modifie lib/configOverview.js : les items "stripe" et "transfer" de la carte Paiement
//      reçoivent sensitive: true et un warningText contextuel.
//   4. Modifie components/AdminConfig.js : ConfigView rend un <SensitiveSwitch> (au lieu de
//      <FlagControl>) pour tout item marqué sensitive: true ; AdminConfig fournit la fonction
//      onSensitiveConfirm qui appelle setPaymentMethod() puis recharge les réglages (cfg.reload()).
//
// Aucun autre comportement de C1/C2/C5 n'est modifié. TVA (billing.vat_enabled) n'est PAS traité
// ici : il fera l'objet du lot C3-c, séparément.
//
// IMPORTANT : tout le traitement se fait EN MÉMOIRE. Aucun fichier n'est écrit sur le disque
// avant la toute dernière étape, et uniquement si --dry-run n'est PAS présent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

function log(msg) {
  console.log(msg);
}

function readFile(relPath) {
  const p = path.join(repoRoot, relPath);
  if (!fs.existsSync(p)) {
    throw new Error(`Fichier introuvable : ${relPath}`);
  }
  return { p, content: fs.readFileSync(p, "utf8") };
}

// Construit un motif regex tolérant aux différences d'indentation / de retours à la ligne :
// chaque token (séparé par un espace/saut de ligne dans le motif d'origine) est mis bout à bout
// avec \s+ entre chacun. Cela permet de retrouver un bloc de code même si l'indentation réelle
// du fichier diffère légèrement de celle utilisée pour préparer ce patch.
function buildFlexibleRegex(pattern) {
  const tokens = pattern.split(/\s+/).filter(Boolean);
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+"));
}

// Applique un remplacement EN MÉMOIRE sur `content`. Lève une erreur si le motif est absent
// ou trouvé plusieurs fois (sécurité anti-ambiguïté). Retourne le nouveau contenu.
function replaceOnce(content, oldPattern, newStr, relPath) {
  const re = buildFlexibleRegex(oldPattern);
  const matches = content.match(new RegExp(re.source, "g"));
  if (!matches || matches.length === 0) {
    throw new Error(
      `Motif attendu introuvable dans ${relPath}. Le fichier a probablement changé depuis la préparation de ce patch.\n` +
        `Motif recherché (début) : ${oldPattern.trim().slice(0, 80).replace(/\n/g, " ")}...`
    );
  }
  if (matches.length > 1) {
    throw new Error(`Motif trouvé ${matches.length} fois dans ${relPath} (attendu : 1 seule fois). Abandon par sécurité.`);
  }
  return content.replace(re, () => newStr);
}

const plannedWrites = []; // [{ path, content, label }] — écrit uniquement à la fin, si !dryRun

// ------------------------------------------------------------------
// 1. NOUVEAU FICHIER : lib/paymentActions.js
// ------------------------------------------------------------------
const paymentActionsRelPath = "lib/paymentActions.js";
const paymentActionsAbsPath = path.join(repoRoot, paymentActionsRelPath);
if (fs.existsSync(paymentActionsAbsPath)) {
  throw new Error(`${paymentActionsRelPath} existe déjà : ce patch ne l'écrase pas automatiquement.`);
}
const paymentActionsContent = `// lib/paymentActions.js
// ZENORIA_CONFIG_C3B_V1
//
// Fonction d'écriture PARTAGÉE pour les moyens de paiement (clé "payment_methods").
// Utilisée par components/AdminPaymentMethods.js (Admin > CRM > Commandes) ET par
// components/AdminConfig.js (onglet Configuration, lot C3) via SensitiveSwitch, afin de
// garantir un seul chemin d'écriture et un seul garde-fou (isTransferReady).
//
// lib/paymentSettings.js reste volontairement "sans dépendance" (voir son en-tête) : la
// dépendance à supabase est isolée ici, pas ajoutée à paymentSettings.js.
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { PAYMENT_METHODS_KEY, isTransferReady } from "@/lib/paymentSettings";

// Levée quand on tente d'activer le virement sans bénéficiaire/IBAN valides déjà enregistrés.
export class TransferNotReadyError extends Error {}

// currentMethods : { stripe_enabled, transfer_enabled } (déjà parsé via parsePaymentMethods)
// savedBank      : { beneficiary, iban, bic, delay_days, grace_days } (déjà parsé via parseBankTransfer)
// field          : "stripe_enabled" | "transfer_enabled"
// next           : bool, valeur cible
// Retourne la nouvelle valeur écrite, ou lève une erreur (TransferNotReadyError ou erreur Supabase).
export async function setPaymentMethod(currentMethods, savedBank, field, next) {
  if (field === "transfer_enabled" && next && !isTransferReady(savedBank)) {
    throw new TransferNotReadyError(
      "Pour activer le virement, renseignez puis enregistrez d'abord le bénéficiaire et un IBAN valide."
    );
  }
  const value = {
    stripe_enabled: field === "stripe_enabled" ? next : currentMethods.stripe_enabled,
    transfer_enabled: field === "transfer_enabled" ? next : currentMethods.transfer_enabled,
  };
  const { error } = await supabase
    .from(SITE_SETTINGS_TABLE)
    .upsert({ key: PAYMENT_METHODS_KEY, value }, { onConflict: "key" });
  if (error) throw error;
  return value;
}
`;
plannedWrites.push({ path: paymentActionsAbsPath, content: paymentActionsContent, label: `${paymentActionsRelPath} (nouveau)` });

// ------------------------------------------------------------------
// 2. MODIFIER components/AdminPaymentMethods.js (en mémoire)
// ------------------------------------------------------------------
{
  const relPath = "components/AdminPaymentMethods.js";
  const { p, content: original } = readFile(relPath);
  let content = original;

  content = replaceOnce(
    content,
    `formatIban,
  normalizeIban,
} from "@/lib/paymentSettings";`,
    `formatIban,
  normalizeIban,
} from "@/lib/paymentSettings";
import { setPaymentMethod } from "@/lib/paymentActions"; // ZENORIA_CONFIG_C3B_V1`,
    relPath
  );

  content = replaceOnce(
    content,
    `setBusy(true);
    try {
      const value = {
        stripe_enabled: field === "stripe_enabled" ? next : savedMethods.stripe_enabled,
        transfer_enabled: field === "transfer_enabled" ? next : savedMethods.transfer_enabled,
      };
      const { error: err } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .upsert({ key: PAYMENT_METHODS_KEY, value }, { onConflict: "key" });
      if (err) throw err;
      setToast(`,
    `setBusy(true);
    try {
      await setPaymentMethod(savedMethods, savedBank, field, next); // ZENORIA_CONFIG_C3B_V1 : fonction partagée avec l'onglet Configuration
      setToast(`,
    relPath
  );

  plannedWrites.push({ path: p, content, label: relPath });
}

// ------------------------------------------------------------------
// 3. MODIFIER lib/configOverview.js (en mémoire)
// ------------------------------------------------------------------
{
  const relPath = "lib/configOverview.js";
  const { p, content: original } = readFile(relPath);
  let content = original;

  content = replaceOnce(
    content,
    `import { parseSeasonFxSetting, FX_SEASON_NAMES } from "@/lib/siteSettings";`,
    `import { parseSeasonFxSetting, FX_SEASON_NAMES } from "@/lib/siteSettings";
import { isTransferReady } from "@/lib/paymentSettings"; // ZENORIA_CONFIG_C3B_V1`,
    relPath
  );

  content = replaceOnce(
    content,
    `const payment = [
    { id: "stripe", label: "Carte bancaire (Stripe)", flag: pm ? flag(pm.stripe_enabled) : null },
    { id: "transfer", label: "Virement bancaire", flag: pm ? flag(pm.transfer_enabled) : null },`,
    `// ZENORIA_CONFIG_C3B_V1 : Stripe et Virement sont des réglages sensibles (confirmation "BINHEMI" requise).
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
    },`,
    relPath
  );

  plannedWrites.push({ path: p, content, label: relPath });
}

// ------------------------------------------------------------------
// 4. MODIFIER components/AdminConfig.js (en mémoire)
// ------------------------------------------------------------------
{
  const relPath = "components/AdminConfig.js";
  const { p, content: original } = readFile(relPath);
  let content = original;

  content = replaceOnce(
    content,
    `import FlagControl from "@/components/ConfigSwitch";
import { useConfigToggle } from "@/lib/configToggle";`,
    `import FlagControl from "@/components/ConfigSwitch";
import { useConfigToggle } from "@/lib/configToggle";
import SensitiveSwitch from "@/components/SensitiveSwitch"; // ZENORIA_CONFIG_C3B_V1
import { setPaymentMethod, TransferNotReadyError } from "@/lib/paymentActions";
import { parsePaymentMethods, parseBankTransfer } from "@/lib/paymentSettings";`,
    relPath
  );

  content = replaceOnce(
    content,
    `export function ConfigView({ sections, loaded, loading, error, onGo, onReload, onToggle, busyId, notice }) {`,
    `export function ConfigView({ sections, loaded, loading, error, onGo, onReload, onToggle, busyId, notice, onSensitiveConfirm }) {`,
    relPath
  );

  content = replaceOnce(
    content,
    `{it.flag !== undefined ? (
                      <FlagControl it={it} busyId={busyId} onToggle={onToggle} />
                    ) : (
                      <span className={"text-[13px] " + (it.missing ? "text-[#8b737e] italic" : TONES[it.tone] || "text-[#54434c]")}>{it.text}</span>
                    )}`,
    `{it.flag !== undefined ? (
                      it.sensitive ? (
                        <SensitiveSwitch
                          id={it.id}
                          label={it.label}
                          checked={it.flag === true}
                          disabled={it.flag === null}
                          warningText={it.warningText}
                          onConfirm={(next) => onSensitiveConfirm(it.id, next)}
                        />
                      ) : (
                        <FlagControl it={it} busyId={busyId} onToggle={onToggle} />
                      )
                    ) : (
                      <span className={"text-[13px] " + (it.missing ? "text-[#8b737e] italic" : TONES[it.tone] || "text-[#54434c]")}>{it.text}</span>
                    )}`,
    relPath
  );

  content = replaceOnce(
    content,
    `const sections = buildConfigOverview({ rows: cfg.rows, meta: cfg.meta, maintenance: maint });
  return (
    <>
      <ConfigView sections={sections} loaded={cfg.loaded} loading={cfg.loading} error={cfg.error} onGo={onGo} onReload={cfg.reload} onToggle={toggle.run} busyId={toggle.busyId} notice={toggle.notice} />
      {/* ZENORIA_CONFIG_C5_V1 */}
      {cfg.loaded && !cfg.error ? <ConfigLog refreshKey={cfg.rows} /> : null}
    </>
  );
}`,
    `const sections = buildConfigOverview({ rows: cfg.rows, meta: cfg.meta, maintenance: maint });

  // ZENORIA_CONFIG_C3B_V1 : Stripe et Virement passent par le même garde-fou que la carte
  // "Moyens de paiement" (AdminPaymentMethods.js), via la fonction partagée setPaymentMethod
  // (lib/paymentActions.js). Confirmation "BINHEMI" gérée par SensitiveSwitch lui-même.
  const handleSensitiveConfirm = async (id, next) => {
    if (id === "stripe" || id === "transfer") {
      const currentMethods = parsePaymentMethods(cfg.rows.payment_methods ? cfg.rows.payment_methods.value : null);
      const savedBank = parseBankTransfer(cfg.rows.bank_transfer ? cfg.rows.bank_transfer.value : null);
      const field = id === "stripe" ? "stripe_enabled" : "transfer_enabled";
      try {
        await setPaymentMethod(currentMethods, savedBank, field, next);
        cfg.reload();
      } catch (err) {
        throw err instanceof TransferNotReadyError ? err : new Error((err && err.message) || "Échec de l'enregistrement.");
      }
      return;
    }
    throw new Error("Réglage non pris en charge.");
  };

  return (
    <>
      <ConfigView
        sections={sections}
        loaded={cfg.loaded}
        loading={cfg.loading}
        error={cfg.error}
        onGo={onGo}
        onReload={cfg.reload}
        onToggle={toggle.run}
        busyId={toggle.busyId}
        notice={toggle.notice}
        onSensitiveConfirm={handleSensitiveConfirm}
      />
      {/* ZENORIA_CONFIG_C5_V1 */}
      {cfg.loaded && !cfg.error ? <ConfigLog refreshKey={cfg.rows} /> : null}
    </>
  );
}`,
    relPath
  );

  plannedWrites.push({ path: p, content, label: relPath });
}

// ------------------------------------------------------------------
// Récapitulatif / écriture finale (UNIQUEMENT si !dryRun)
// ------------------------------------------------------------------
log(`Mode : ${dryRun ? "DRY-RUN (aucune écriture disque)" : "ÉCRITURE"}`);
log("Fichiers concernés :");
for (const w of plannedWrites) {
  log(`  - ${w.label}`);
}

if (dryRun) {
  log("\n✓ Tous les motifs attendus ont été trouvés et toutes les transformations se sont appliquées sans ambiguïté.");
  log("  Aucune écriture n'a été effectuée sur le disque (dry-run).");
  process.exit(0);
}

for (const w of plannedWrites) {
  fs.mkdirSync(path.dirname(w.path), { recursive: true });
  fs.writeFileSync(w.path, w.content, "utf8");
  log(`✓ Écrit : ${path.relative(repoRoot, w.path)}`);
}

log("\nProchaines étapes :");
log("  1. npm run build   (vérifier qu'il n'y a pas d'erreur de lint/build)");
log("  2. Tester en local : Configuration > Paiement > interrupteurs Stripe / Virement");
log("     - Vérifier que le clic ouvre le panneau de confirmation BINHEMI");
log("     - Vérifier qu'activer le virement sans IBAN valide affiche bien l'erreur");
log("     - Vérifier que la carte 'Moyens de paiement' (AdminPaymentMethods.js) fonctionne toujours à l'identique");
log("  3. git add lib/paymentActions.js components/AdminPaymentMethods.js lib/configOverview.js components/AdminConfig.js scripts/patch-lotC3b-stripe-virement.mjs");
log('  4. git commit -m "Lot C3-b : interrupteurs sensibles Stripe et Virement (Configuration)"');
