// scripts/debug-products-query.mjs
//
// Script de DIAGNOSTIC uniquement (lecture seule, ne modifie rien).
// Reproduit exactement la requete utilisee par pages/api/checkout.js sur
// la table "products", et affiche l'erreur COMPLETE renvoyee par Supabase
// (si erreur il y a), pour comprendre pourquoi checkout.js echoue.
//
// Lit les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
// directement dans .env.local (pas besoin du package "dotenv").
//
// Usage : node scripts/debug-products-query.mjs

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const raw = fs.readFileSync(".env.local", "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("URL trouvée :", url ? "oui" : "NON — variable absente de .env.local");
console.log("Clé trouvée :", key ? "oui" : "NON — variable absente de .env.local");

if (!url || !key) {
  console.error("\n✗ Variables manquantes dans .env.local, arrêt du diagnostic.");
  process.exit(1);
}

const supabase = createClient(url, key);

const ids = [1, 6]; // les deux identifiants que vous avez testés
console.log("\nRequête testée : products, colonnes id/name/price/promo_price/stock/active, id in", ids, ", active = true\n");

const { data, error } = await supabase
  .from("products")
  .select("id, name, price, promo_price, stock, active")
  .in("id", ids)
  .eq("active", true);

if (error) {
  console.error("✗ Erreur renvoyée par Supabase :\n");
  console.error(JSON.stringify(error, null, 2));
} else {
  console.log(`✓ Requête réussie : ${data.length} ligne(s) trouvée(s)\n`);
  console.log(JSON.stringify(data, null, 2));
}
