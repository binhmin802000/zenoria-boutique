#!/usr/bin/env node
// ============================================================
// PATCH LOT 2b (2/3) : pages/api/webhooks/stripe.js — consommation du stock, gestion de l'expiration
// Modifie uniquement ce fichier. Reutilise consume_order_items et release_order_items (lot 2a-bis).
//
// Changements :
//   - Traite aussi l'evenement "checkout.session.expired" (abandon de paiement) : libere la reservation
//     de stock/pieces immediatement et passe la commande en "expired" (sans attendre le cron quotidien).
//   - Apres passage du statut a "paid" (dans les DEUX branches : commande pending existante, et filet de
//     securite), appelle consume_order_items pour decompter reellement le stock et marquer les pieces vendues.
//   - Si le stock est devenu insuffisant entre la reservation et la confirmation, le paiement N'EST JAMAIS
//     bloque ; une alerte est ecrite en ADMINISTRATION UNIQUEMENT (customer_visible = false), meme principe
//     que pour le virement (lot 2a-bis, admin_confirm_transfer).
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot2b-webhook.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-lot2b-webhook.mjs --apply     -> ecrit si TOUT est conforme
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_STOCK_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "pages/api/webhooks/stripe.js",
  "patches": [
   {
    "name": "W1 ecoute aussi checkout.session.expired en plus de completed",
    "find": [
     "if (event.type !== \"checkout.session.completed\") {",
     "return res.status(200).json({ ok: true, ignored: event.type });",
     "}",
     "const session = event.data.object;"
    ],
    "replace": [
     "if (event.type !== \"checkout.session.completed\" && event.type !== \"checkout.session.expired\") { // ZENORIA_STOCK_V1",
     "    return res.status(200).json({ ok: true, ignored: event.type });",
     "  }",
     "  const session = event.data.object;",
     "  // ZENORIA_STOCK_V1 : une session abandonnee libere la reservation de stock/pieces sans attendre",
     "  // l'expiration naturelle (31 minutes) ni le cron quotidien ; la commande passe en \"expired\".",
     "  if (event.type === \"checkout.session.expired\") {",
     "    try {",
     "      const { data: pendingOrder } = await supabaseAdmin",
     "        .from(\"orders\")",
     "        .select(\"id, status\")",
     "        .eq(\"stripe_session_id\", session.id)",
     "        .maybeSingle();",
     "      if (!pendingOrder || pendingOrder.status !== \"pending\") {",
     "        return res.status(200).json({ ok: true, ignored: \"expired_no_pending_order\" });",
     "      }",
     "      await supabaseAdmin.rpc(\"release_order_items\", { p_order_id: pendingOrder.id, p_reason: \"expired\" });",
     "      const { error: expireErr } = await supabaseAdmin.from(\"orders\").update({ status: \"expired\" }).eq(\"id\", pendingOrder.id);",
     "      if (expireErr) {",
     "        console.error(\"[webhook-stripe] échec passage en expired :\", expireErr.message);",
     "        return res.status(500).json({ ok: false, error: \"échec mise à jour commande\" });",
     "      }",
     "      await supabaseAdmin.from(\"order_status_history\").insert({",
     "        order_id: pendingOrder.id,",
     "        status: \"expired\",",
     "        note: \"Session de paiement expirée sans confirmation : commande annulée, article(s) remis en vente.\",",
     "      });",
     "      return res.status(200).json({ ok: true, orderId: pendingOrder.id, expired: true });",
     "    } catch (err) {",
     "      console.error(\"[webhook-stripe] erreur inattendue (session expiree) :\", err && err.message ? err.message : err);",
     "      return res.status(500).json({ ok: false, error: \"erreur serveur\" });",
     "    }",
     "  }"
    ]
   },
   {
    "name": "W2 consommation du stock/pieces apres passage a paid (branche commande pending existante)",
    "find": [
     "orderId = updatedOrder.id;",
     "} else {"
    ],
    "replace": [
     "orderId = updatedOrder.id;",
     "      await consumeStockAndPieces(orderId); // ZENORIA_STOCK_V1",
     "    } else {"
    ]
   },
   {
    "name": "W3 consommation du stock/pieces apres insertion (branche filet de securite)",
    "find": [
     "orderId = orderRow.id;",
     "if (cartItems.length > 0) {"
    ],
    "replace": [
     "orderId = orderRow.id;",
     "      await consumeStockAndPieces(orderId); // ZENORIA_STOCK_V1",
     "      if (cartItems.length > 0) {"
    ]
   },
   {
    "name": "W4 fonction utilitaire de consommation, avec alerte admin uniquement si stock insuffisant",
    "find": [
     "function readRawBody(req) {"
    ],
    "replace": [
     "// ZENORIA_STOCK_V1 : consomme pieces uniques ET stock ensemble (lot 2a-bis). Ne bloque jamais la confirmation",
     "// du paiement : si le stock est devenu insuffisant entre la reservation et la confirmation, une alerte est",
     "// ecrite dans le journal, visible ADMINISTRATION UNIQUEMENT (customer_visible = false).",
     "async function consumeStockAndPieces(orderId) {",
     "  try {",
     "    const { data: res, error } = await supabaseAdmin.rpc(\"consume_order_items\", { p_order_id: orderId });",
     "    if (error) {",
     "      console.error(\"[webhook-stripe] échec consume_order_items :\", error.message);",
     "      return;",
     "    }",
     "    const alerts = (res && res.stock && res.stock.alerts) || [];",
     "    if (alerts.length > 0) {",
     "      const detail = alerts",
     "        .map((a) => `produit #${a.product_id} — stock avant confirmation : ${a.stock_avant}, quantité requise : ${a.quantite_requise}`)",
     "        .join(\" ; \");",
     "      await supabaseAdmin.from(\"order_status_history\").insert({",
     "        order_id: orderId,",
     "        status: \"paid\",",
     "        note: `Alerte stock (admin) : ${detail}.`,",
     "        customer_visible: false,",
     "      });",
     "    }",
     "  } catch (err) {",
     "    console.error(\"[webhook-stripe] erreur inattendue (consume_order_items) :\", err && err.message ? err.message : err);",
     "  }",
     "}",
     "function readRawBody(req) {"
    ]
   }
  ],
  "finals": [
   "consumeStockAndPieces",
   "checkout.session.expired",
   "ZENORIA_STOCK_V1",
   "release_order_items"
  ],
  "forbidden": []
 }
];

function fail(message) {
  console.error("\nECHEC : " + message);
  console.error("Aucun fichier n'a ete modifie.");
  process.exit(1);
}
if (!mode) fail("indiquez --dry-run ou --apply.");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) =>
  new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");

console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = [];
const problems = [];

for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  const before = problems.length;
  for (const p of f.patches) {
    const count = (content.match(toRegex(p.find)) || []).length;
    console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
    if (count !== 1) problems.push(f.path + " : " + p.name + " (" + count + " occurrence(s) au lieu de 1)");
  }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length > 0) fail("verifier :\n  - " + problems.join("\n  - "));

for (const r of results) {
  for (const needle of r.f.finals) if (!r.content.includes(needle)) fail("controle final " + r.f.path + " : « " + needle + " » absent apres patch.");
  for (const bad of r.f.forbidden) if (r.content.includes(bad)) fail("controle final " + r.f.path + " : « " + bad + " » est toujours present apres patch.");
}
if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-lot2b-webhook.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichier(s) modifie(s).");
console.log("Etapes suivantes : git status --short, puis npm run build.");
console.log("Retour arriere avant commit : git restore pages/api/webhooks/stripe.js");
console.log("\nIMPORTANT : ajoutez aussi « checkout.session.expired » aux evenements ecoutes par le point de");
console.log("terminaison Stripe (Dashboard > Developers > Webhooks > votre endpoint > Add events), sinon cet");
console.log("evenement ne sera jamais envoye a votre serveur malgre le code pret a le recevoir.");
