// scripts/setup-expire-pending-orders.mjs
//
// Met en place l'expiration automatique des commandes "pending" de plus
// de 24h (option A validee) :
//
//   1. Cree pages/api/cron/expire-pending-orders.js : recherche les
//      commandes pending depuis plus de 24h, les passe a "expired",
//      trace l'evenement dans order_status_history. Protegee par
//      CRON_SECRET (verifie via l'en-tete Authorization que Vercel ajoute
//      automatiquement aux appels programmes).
//   2. Cree OU met a jour vercel.json : ajoute une entree "crons" pour
//      appeler cette route une fois par jour (03h00 UTC). Si le fichier
//      existe deja avec d'autres reglages, ils sont CONSERVES : seule la
//      cle "crons" est ajoutee ou completee, jamais ecrasee en bloc.
//
// Prerequis : le statut "expired" doit deja avoir ete ajoute a la
// contrainte orders_status_valid (voir supabase_orders_expired_status.sql),
// et une variable d'environnement CRON_SECRET doit etre definie sur
// Vercel (valeur de votre choix, un secret genere aleatoirement par
// exemple) - ce script ne la cree pas, a faire manuellement dans
// Vercel > Settings > Environment Variables.
//
// Garanties : verifie l'etat des fichiers avant d'ecrire ; n'ecrase
// jamais un vercel.json existant, fusionne seulement la cle "crons" ;
// conserve les fins de ligne ; peut etre relance sans effet.
//
// Usage : node scripts/setup-expire-pending-orders.mjs

import fs from "node:fs";
import path from "node:path";

const CRON_ROUTE_CONTENT = [
  "// ZENORIA_API_CRON_EXPIRE_PENDING_V1",
  "// ============================================================",
  "// pages/api/cron/expire-pending-orders.js",
  "//",
  "// Route appelee automatiquement une fois par jour par Vercel (voir",
  "// vercel.json, section \"crons\"). Fait passer au statut \"expired\" toute",
  "// commande encore \"pending\" depuis plus de 24h, et trace l'evenement",
  "// dans order_status_history.",
  "//",
  "// SECURITE : cette route n'est PAS protegee par une session utilisateur",
  "// (elle n'est jamais appelee depuis un navigateur), mais par un secret",
  "// partage (CRON_SECRET), verifie via l'en-tete Authorization que Vercel",
  "// ajoute automatiquement a chaque appel programme. Toute requete sans ce",
  "// secret, ou avec un secret incorrect, est rejetee.",
  "//",
  "// Avec le plan Vercel gratuit (Hobby), ce cron ne peut s'executer qu'une",
  "// fois par jour, avec une precision de +/- 59 minutes : le delai reel",
  "// avant expiration d'une commande peut donc varier entre 24h et un peu",
  "// moins de 48h selon son heure de creation (choix assume, documente dans",
  "// l'etat des lieux du projet).",
  "// ============================================================",
  "",
  "import { supabaseAdmin } from \"@/lib/supabaseAdmin\";",
  "",
  "const EXPIRE_AFTER_HOURS = 24;",
  "",
  "export default async function handler(req, res) {",
  "  const authHeader = req.headers.authorization || \"\";",
  "  const expected = `Bearer ${process.env.CRON_SECRET || \"\"}`;",
  "",
  "  if (!process.env.CRON_SECRET || authHeader !== expected) {",
  "    return res.status(401).json({ ok: false, error: \"non autoris\u00e9\" });",
  "  }",
  "",
  "  try {",
  "    const cutoff = new Date(Date.now() - EXPIRE_AFTER_HOURS * 3600 * 1000).toISOString();",
  "",
  "    const { data: toExpire, error: selectErr } = await supabaseAdmin",
  "      .from(\"orders\")",
  "      .select(\"id\")",
  "      .eq(\"status\", \"pending\")",
  "      .lt(\"created_at\", cutoff);",
  "",
  "    if (selectErr) {",
  "      console.error(\"[cron-expire] \u00e9chec lecture commandes pending :\", selectErr.message);",
  "      return res.status(500).json({ ok: false, error: \"\u00e9chec lecture\" });",
  "    }",
  "",
  "    const ids = (toExpire || []).map((o) => o.id);",
  "",
  "    if (ids.length === 0) {",
  "      return res.status(200).json({ ok: true, expired: 0 });",
  "    }",
  "",
  "    const { error: updateErr } = await supabaseAdmin",
  "      .from(\"orders\")",
  "      .update({ status: \"expired\" })",
  "      .in(\"id\", ids);",
  "",
  "    if (updateErr) {",
  "      console.error(\"[cron-expire] \u00e9chec mise \u00e0 jour des commandes :\", updateErr.message);",
  "      return res.status(500).json({ ok: false, error: \"\u00e9chec mise \u00e0 jour\" });",
  "    }",
  "",
  "    const historyRows = ids.map((id) => ({",
  "      order_id: id,",
  "      status: \"expired\",",
  "      note: `Expir\u00e9e automatiquement apr\u00e8s ${EXPIRE_AFTER_HOURS}h sans paiement confirm\u00e9.`,",
  "    }));",
  "    const { error: historyErr } = await supabaseAdmin.from(\"order_status_history\").insert(historyRows);",
  "    if (historyErr) {",
  "      console.error(\"[cron-expire] \u00e9chec \u00e9criture order_status_history :\", historyErr.message);",
  "    }",
  "",
  "    return res.status(200).json({ ok: true, expired: ids.length });",
  "  } catch (err) {",
  "    console.error(\"[cron-expire] erreur inattendue :\", err && err.message ? err.message : err);",
  "    return res.status(500).json({ ok: false, error: \"erreur serveur\" });",
  "  }",
  "}",
].join("\r\n") + "\r\n";

const cronRoutePath = path.join("pages", "api", "cron", "expire-pending-orders.js");
const vercelJsonPath = "vercel.json";

let wrote = false;

// ---------------------------------------------------------------------
// 1) Route API du cron
// ---------------------------------------------------------------------
if (fs.existsSync(cronRoutePath)) {
  const existing = fs.readFileSync(cronRoutePath, "utf8");
  if (existing.includes("ZENORIA_API_CRON_EXPIRE_PENDING_V1")) {
    console.log(`= ${cronRoutePath} : déjà en place, inchangé.`);
  } else {
    console.error(`✗ ${cronRoutePath} existe déjà avec un contenu différent — rien n'a été écrit.`);
    console.error("Supprimez-le ou renommez-le si vous voulez le remplacer, puis relancez ce script.");
    process.exit(1);
  }
} else {
  fs.mkdirSync(path.dirname(cronRoutePath), { recursive: true });
  fs.writeFileSync(cronRoutePath, CRON_ROUTE_CONTENT, "utf8");
  console.log(`✓ ${cronRoutePath} : créé.`);
  wrote = true;
}

// ---------------------------------------------------------------------
// 2) vercel.json : fusion de la clé "crons" sans écraser le reste
// ---------------------------------------------------------------------
const cronEntry = {
  path: "/api/cron/expire-pending-orders",
  schedule: "0 3 * * *",
};

let vercelConfig = {};
let vercelJsonExisted = false;

if (fs.existsSync(vercelJsonPath)) {
  vercelJsonExisted = true;
  const raw = fs.readFileSync(vercelJsonPath, "utf8");
  try {
    vercelConfig = JSON.parse(raw);
  } catch (e) {
    console.error(`✗ ${vercelJsonPath} existe mais n'est pas un JSON valide — rien n'a été modifié.`);
    console.error("Corrigez-le manuellement, ou supprimez-le si vous êtes sûr de ne pas en avoir besoin, puis relancez ce script.");
    process.exit(1);
  }
}

const existingCrons = Array.isArray(vercelConfig.crons) ? vercelConfig.crons : [];
const alreadyHasEntry = existingCrons.some(
  (c) => c && c.path === cronEntry.path
);

if (alreadyHasEntry) {
  console.log(`= ${vercelJsonPath} : l'entrée cron pour « ${cronEntry.path} » est déjà présente, inchangé.`);
} else {
  vercelConfig.crons = [...existingCrons, cronEntry];
  const serialized = JSON.stringify(vercelConfig, null, 2) + "\n";
  fs.writeFileSync(vercelJsonPath, serialized, "utf8");
  if (vercelJsonExisted) {
    console.log(`✓ ${vercelJsonPath} : entrée cron ajoutée (fichier existant conservé, autres réglages inchangés).`);
  } else {
    console.log(`✓ ${vercelJsonPath} : créé avec l'entrée cron.`);
  }
  wrote = true;
}

console.log("\nRappel important avant déploiement :");
console.log("  • Créez la variable d'environnement CRON_SECRET dans Vercel (Settings > Environment Variables),");
console.log("    avec une valeur secrète de votre choix (ex. une chaîne aléatoire), en « All Environments ».");
console.log("  • Le statut « expired » doit déjà exister dans la contrainte orders_status_valid");
console.log("    (supabase_orders_expired_status.sql) avant la première exécution du cron.");

if (!wrote) {
  console.log("\nRien à faire : tout était déjà en place.");
} else {
  console.log("\nTerminé.");
}
