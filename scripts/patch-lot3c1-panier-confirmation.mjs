#!/usr/bin/env node
// ============================================================
// PATCH SOUS-LOT 3c-1 : etape 3 du virement - panier et confirmation (pages/index.js)
// Cree     : components/TransferInstructions.js (coordonnees de virement, partage avec Mon compte au lot 3c-2)
// Modifie  : pages/index.js (confirmation apres commande, recapitulatif corrige, message de piece indisponible)
// Prerequis : lots 3a, 3a-bis et 3b appliques en base et en code.
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot3c1-panier-confirmation.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-lot3c1-panier-confirmation.mjs --apply     -> ecrit si TOUT est conforme
// Garde-fous : rien n'est ecrit si un repere est absent ou en double, si le composant existe deja, ou si le patch est deja applique.
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_STEP3C_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "components/TransferInstructions.js",
  "kind": "create",
  "content": "// ZENORIA_STEP3C_V1\n// ============================================================\n// components/TransferInstructions.js\n//\n// Coordonnées de virement d'une commande, partagées entre la confirmation après commande\n// (pages/index.js) et le détail d'une commande dans Mon compte (pages/compte.js).\n// Lit la fonction SQL customer_transfer_instructions(order_id) (lot 3a) : réservée à la cliente\n// propriétaire d'une commande encore en attente de virement. Dès que la commande est payée ou\n// annulée, la fonction ne renvoie plus les coordonnées (masquage garanti côté base, pas ici).\n// ============================================================\nimport React, { useEffect, useState } from \"react\";\nimport { supabase } from \"@/lib/supabase\";\nimport { formatOrderPrice, formatOrderReference } from \"@/lib/orderDisplay\";\nimport { buildMailtoLink, buildWhatsAppLink } from \"@/lib/contactSettings\";\n\nconst TIME_ZONE = \"Europe/Paris\";\n\nfunction formatDueDate(value) {\n  if (!value) return \"—\";\n  return new Date(value).toLocaleDateString(\"fr-FR\", { timeZone: TIME_ZONE });\n}\nfunction groupIban(iban) {\n  return String(iban || \"\").replace(/(.{4})/g, \"$1 \").trim();\n}\n\nfunction CopyField({ label, value, testId }) {\n  const [copied, setCopied] = useState(false);\n  const copy = async () => {\n    try {\n      await navigator.clipboard.writeText(value);\n      setCopied(true);\n      setTimeout(() => setCopied(false), 2500);\n    } catch (e) {\n      // copie indisponible : la cliente peut sélectionner le texte à la main\n    }\n  };\n  return (\n    <div className=\"flex items-center justify-between gap-2 py-1\">\n      <div className=\"min-w-0\">\n        <div className=\"text-[11px] text-[#8b737e]\">{label}</div>\n        <div className=\"text-sm text-[#412f3b] break-all\">{value}</div>\n      </div>\n      <button type=\"button\" onClick={copy} data-testid={testId} className=\"shrink-0 rounded-full border border-[#d9c5cc] px-3 py-1 text-xs hover:bg-[#f5edf1]\">\n        {copied ? \"Copié !\" : \"Copier\"}\n      </button>\n    </div>\n  );\n}\n\nexport default function TransferInstructions({ orderId, contactCfg }) {\n  const [state, setState] = useState(\"loading\"); // loading | ok | unavailable | error\n  const [data, setData] = useState(null);\n\n  useEffect(() => {\n    let alive = true;\n    setState(\"loading\");\n    setData(null);\n    supabase\n      .rpc(\"customer_transfer_instructions\", { p_order_id: orderId })\n      .then((res) => {\n        if (!alive) return;\n        if (res.error || !res.data) {\n          setState(\"error\");\n          return;\n        }\n        setData(res.data);\n        setState(res.data.state === \"ok\" ? \"ok\" : \"unavailable\");\n      })\n      .catch(() => {\n        if (alive) setState(\"error\");\n      });\n    return () => {\n      alive = false;\n    };\n  }, [orderId]);\n\n  if (state === \"loading\") {\n    return (\n      <p className=\"text-sm text-[#8b737e]\" data-testid=\"transfer-instructions-loading\">\n        Chargement des coordonnées…\n      </p>\n    );\n  }\n  if (state === \"error\") {\n    return (\n      <div data-testid=\"transfer-instructions-error\" className=\"rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm leading-5\">\n        Impossible d&apos;afficher les coordonnées pour le moment. Retrouvez-les dans Mon compte, ou contactez-nous.\n      </div>\n    );\n  }\n\n  const reference = formatOrderReference({ id: data.order_id, created_at: data.created_at });\n\n  if (state === \"unavailable\") {\n    const hasEmail = Boolean(contactCfg && contactCfg.email && contactCfg.email.enabled && contactCfg.email.value);\n    const hasWhatsapp = Boolean(contactCfg && contactCfg.whatsapp && contactCfg.whatsapp.enabled && contactCfg.whatsapp.value);\n    const subject = `Virement pour ma commande ${reference}`;\n    const body = `Bonjour,\\n\\nJe souhaite connaître les coordonnées bancaires pour régler ma commande ${reference}.\\n`;\n    const waText = `Bonjour, pourriez-vous me donner les coordonnées pour régler ma commande ${reference} par virement ?`;\n    const href = hasEmail\n      ? buildMailtoLink(contactCfg.email.value, subject, body)\n      : hasWhatsapp\n      ? buildWhatsAppLink(contactCfg.whatsapp.value, waText)\n      : null;\n    return (\n      <div data-testid=\"transfer-instructions-unavailable\" className=\"rounded-xl bg-white border border-[#eee2e5] px-4 py-3 text-sm text-[#54434c] space-y-2\">\n        <div>\n          Commande {reference} · <strong>{formatOrderPrice(data.total)}</strong>\n        </div>\n        <div className=\"rounded-xl bg-amber-50 text-amber-900 px-3 py-2 text-[13px] leading-5\">\n          Les coordonnées bancaires vous seront communiquées.{\" \"}\n          {href ? (\n            <a href={href} target={hasEmail ? undefined : \"_blank\"} rel=\"noopener noreferrer\" className=\"underline\">\n              Contactez-nous\n            </a>\n          ) : (\n            \"Contactez-nous pour les obtenir.\"\n          )}\n        </div>\n      </div>\n    );\n  }\n\n  return (\n    <div data-testid=\"transfer-instructions\" className=\"rounded-xl bg-white border border-[#eee2e5] px-4 py-3 space-y-1\">\n      <div className=\"text-[13px] font-medium text-[#412f3b] mb-1\">\n        Commande {reference} · {formatOrderPrice(data.total)}\n      </div>\n      <CopyField label=\"Bénéficiaire\" value={data.beneficiary} testId=\"transfer-copy-beneficiary\" />\n      <CopyField label=\"IBAN\" value={groupIban(data.iban)} testId=\"transfer-copy-iban\" />\n      {data.bic && <CopyField label=\"BIC\" value={data.bic} testId=\"transfer-copy-bic\" />}\n      <CopyField label=\"Référence à indiquer\" value={reference} testId=\"transfer-copy-reference\" />\n      <div className=\"pt-2 mt-1 border-t border-[#f0e6ea] text-sm text-[#54434c]\">\n        Merci d&apos;effectuer votre virement avant le <strong>{formatDueDate(data.due_at)}</strong>. Votre bijou vous est réservé jusqu&apos;à cette date. Au-delà, la commande pourra être annulée.\n      </div>\n    </div>\n  );\n}\n",
  "finals": [
   "export default function TransferInstructions",
   "ZENORIA_STEP3C_V1"
  ],
  "forbidden": []
 },
 {
  "path": "pages/index.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "I1 import du composant partage",
    "find": [
     "import ProductSheet from \"@/components/ProductSheet\";"
    ],
    "replace": [
     "import ProductSheet from \"@/components/ProductSheet\";",
     "import TransferInstructions from \"@/components/TransferInstructions\"; // ZENORIA_STEP3C_V1"
    ]
   },
   {
    "name": "I2 fonction d'avertissement pour une piece unique indisponible",
    "find": [
     "export default function ZenoriaShop() {"
    ],
    "replace": [
     "function PieceUnavailableNotice({ contactSettings, names }) {",
     "  const hasEmail = Boolean(contactSettings.email.enabled && contactSettings.email.value.trim());",
     "  const hasWhatsapp = Boolean(contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim());",
     "  const label = names.length ? names.join(\", \") : \"cette création\";",
     "  const subject = `À propos de « ${label} »`;",
     "  const body = `Bonjour,\\n\\nLa bague « ${label} » m'intéresse. Est-elle disponible, ou pouvez-vous me proposer une création qui s'en inspire ?\\n`;",
     "  const waText = `Bonjour, la bague « ${label} » m'intéresse. Est-elle disponible ?`;",
     "  const href = hasEmail",
     "    ? buildMailtoLink(contactSettings.email.value.trim(), subject, body)",
     "    : hasWhatsapp",
     "    ? buildWhatsAppLink(contactSettings.whatsapp.value.trim(), waText)",
     "    : null;",
     "  return (",
     "    <p role=\"alert\" data-testid=\"transfer-piece-unavailable\" className=\"text-[11px] text-center rounded-lg bg-red-50 text-red-700 px-3 py-1.5 leading-4\">",
     "      {names.length > 0 ? (",
     "        <>La pièce unique « {names.join(\" », « \")} » vient d&apos;être réservée ou vendue. Retirez-la de votre panier pour continuer.</>",
     "      ) : (",
     "        <>Une pièce unique de votre panier vient d&apos;être réservée ou vendue. Retirez-la de votre panier pour continuer.</>",
     "      )}",
     "      {href && (",
     "        <>",
     "          {\" \"}",
     "          <a href={href} target={hasEmail ? undefined : \"_blank\"} rel=\"noopener noreferrer\" className=\"underline\">Si cette bague vous intéresse, écrivez-nous</a>.",
     "        </>",
     "      )}",
     "    </p>",
     "  );",
     "}",
     "export default function ZenoriaShop() {"
    ]
   },
   {
    "name": "I3 etat : identifiants des pieces refusees",
    "find": [
     "const [transferResult, setTransferResult] = useState(null); // { orderId, total, dueAt } apres une commande par virement"
    ],
    "replace": [
     "const [transferResult, setTransferResult] = useState(null); // { orderId, total, dueAt } apres une commande par virement",
     "  const [pieceUnavailableIds, setPieceUnavailableIds] = useState([]); // ZENORIA_STEP3C_V1 : identifiants des pieces uniques refusees (PIECE_UNAVAILABLE)"
    ]
   },
   {
    "name": "I4 noms des pieces indisponibles (a partir du catalogue deja charge)",
    "find": [
     "const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);"
    ],
    "replace": [
     "const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);",
     "  const pieceUnavailableNames = pieceUnavailableIds.map((id) => { const p = products.find((x) => x.id === id); return p ? p.name : null; }).filter(Boolean); // ZENORIA_STEP3C_V1"
    ]
   },
   {
    "name": "I5 fermeture du panier : efface aussi les pieces refusees",
    "find": [
     "if (!cartOpen) setCheckoutError(\"\");  // un message d erreur ne survit pas a la fermeture du panier"
    ],
    "replace": [
     "if (!cartOpen) { setCheckoutError(\"\"); setPieceUnavailableIds([]); } // ZENORIA_STEP3C_V1 : un message d'erreur ou une piece indisponible ne survit pas a la fermeture du panier"
    ]
   },
   {
    "name": "I6 reponse de create_transfer_order : PIECE_UNAVAILABLE (code + identifiants)",
    "find": [
     "if (data && data.ok) {",
     "clearCart();",
     "setCartOpen(false);",
     "setCgvAccepted(false);",
     "setTransferResult({ orderId: data.orderId, total: data.total, dueAt: data.dueAt });",
     "} else {",
     "setCheckoutError((data && data.error) || \"Impossible d§APOS§enregistrer la commande. Merci de réessayer.\");",
     "}"
    ],
    "replace": [
     "if (data && data.ok) {",
     "        clearCart();",
     "        setCartOpen(false);",
     "        setCgvAccepted(false);",
     "        setPieceUnavailableIds([]);",
     "        setTransferResult({ orderId: data.orderId, total: data.total, dueAt: data.dueAt });",
     "      } else {",
     "        // ZENORIA_STEP3C_V1 : une piece unique du panier vient d'etre reservee/vendue -> message avec le nom de la bague et un lien de contact",
     "        setPieceUnavailableIds(data && data.code === \"PIECE_UNAVAILABLE\" && Array.isArray(data.productIds) ? data.productIds : []);",
     "        setCheckoutError((data && data.error) || \"Impossible d'enregistrer la commande. Merci de réessayer.\");",
     "      }"
    ]
   },
   {
    "name": "I7 recapitulatif : IBAN et reference (BIC facultatif)",
    "find": [
     "<p className=\"mt-1\">Une fois la commande validée, nous vous donnons l§APOS§IBAN, le BIC et la référence à indiquer dans votre virement.</p>"
    ],
    "replace": [
     "<p className=\"mt-1\">Une fois la commande validée, nous vous donnons l&apos;IBAN et la référence à indiquer dans votre virement.</p>"
    ]
   },
   {
    "name": "I8 recapitulatif : texte d'echeance corrige (pas d'annulation automatique avant l'etape 4)",
    "find": [
     "la commande est annulée automatiquement et les pièces sont remises en vente. La date et l§APOS§heure exactes vous sont données à la confirmation.</p>"
    ],
    "replace": [
     "la commande pourra être annulée et les pièces remises en vente. La date limite exacte vous est donnée à la confirmation.</p>"
    ]
   },
   {
    "name": "I9 bouton de validation + message d'erreur : pieces indisponibles ou erreur generique",
    "find": [
     "{checkoutError && (",
     "<p role=\"alert\" className=\"text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5\">{checkoutError}</p>",
     ")}",
     "</div>",
     "</>",
     ") : transferStep ? ("
    ],
    "replace": [
     "{pieceUnavailableIds.length > 0 ? (",
     "                      <PieceUnavailableNotice contactSettings={contactSettings} names={pieceUnavailableNames} />",
     "                    ) : checkoutError ? (",
     "                      <p role=\"alert\" className=\"text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5\">{checkoutError}</p>",
     "                    ) : null}",
     "                  </div>",
     "                </>",
     "              ) : transferStep ? ("
    ]
   },
   {
    "name": "I10 fenetre de confirmation : coordonnees reelles a la place du texte provisoire",
    "find": [
     "{/* CONFIRMATION DE COMMANDE PAR VIREMENT (provisoire : IBAN et reference a l§APOS§etape 3e) */}",
     "{transferResult && (",
     "<div className=\"fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4\" role=\"dialog\" aria-modal=\"true\" data-testid=\"transfer-confirmation\">",
     "<div className=\"w-full max-w-md rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl\">",
     "<h3 className=\"font-serif text-2xl text-[#412f3b]\">Commande enregistrée</h3>",
     "<p className=\"mt-3 text-sm text-[#54434c]\">Commande n°{transferResult.orderId} · {formatPrice(Number(transferResult.total))}</p>",
     "<p className=\"mt-1 text-sm text-[#54434c]\">À régler par virement avant le {new Date(transferResult.dueAt).toLocaleDateString(\"fr-FR\", { day: \"2-digit\", month: \"2-digit\", year: \"numeric\", timeZone: \"Europe/Paris\" })}.</p>",
     "<p className=\"mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900\">Étape en cours de construction : les coordonnées bancaires et la référence seront affichées ici. Retrouvez cette commande dans Mon compte.</p>",
     "<button type=\"button\" onClick={() => setTransferResult(null)} data-testid=\"transfer-confirmation-close\" className=\"mt-5 w-full rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm\">Fermer</button>",
     "</div>",
     "</div>",
     ")}"
    ],
    "replace": [
     "{/* CONFIRMATION DE COMMANDE PAR VIREMENT — ZENORIA_STEP3C_V1 */}",
     "      {transferResult && (",
     "        <div className=\"fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4\" role=\"dialog\" aria-modal=\"true\" data-testid=\"transfer-confirmation\">",
     "          <div className=\"w-full max-w-md rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl max-h-[90vh] overflow-y-auto\">",
     "            <h3 className=\"font-serif text-2xl text-[#412f3b]\">Commande enregistrée</h3>",
     "            <p className=\"mt-1 text-sm text-[#54434c]\">Statut : en attente de virement.</p>",
     "            <div className=\"mt-3\">",
     "              <TransferInstructions orderId={transferResult.orderId} contactCfg={contactSettings} />",
     "            </div>",
     "            <a href=\"/compte#commandes\" data-testid=\"transfer-confirmation-account\" className=\"mt-4 block text-center rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white h-11 leading-[2.75rem] text-sm font-medium transition\">Voir ma commande</a>",
     "            <button type=\"button\" onClick={() => setTransferResult(null)} data-testid=\"transfer-confirmation-close\" className=\"mt-2 w-full rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm\">Fermer</button>",
     "          </div>",
     "        </div>",
     "      )}"
    ]
   }
  ],
  "finals": [
   "TransferInstructions orderId={transferResult.orderId}",
   "PieceUnavailableNotice",
   "ZENORIA_STEP3C_V1",
   "pieceUnavailableIds.length > 0"
  ],
  "forbidden": [
   "Étape en cours de construction",
   "le BIC et la référence à indiquer",
   "annulée automatiquement et les pièces sont remises en vente"
  ]
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
  new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+").split("§APOS§").join("(?:&apos;|'|\u2019)"), "g");

console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = [];
const problems = [];

for (const f of FILES) {
  if (f.kind === "create") {
    const exists = fs.existsSync(f.path);
    console.log(f.path + " (nouveau fichier)");
    console.log((exists ? " ERREUR " : "  OK  ") + "le fichier n'existe pas encore");
    if (exists) problems.push(f.path + " existe deja");
    const dir = f.path.split("/").slice(0, -1).join("/");
    if (dir && !fs.existsSync(dir)) problems.push("dossier " + dir + " introuvable : lancez la commande depuis la racine du projet (dossier zenoria)");
    results.push({ f, content: Array.isArray(f.content) ? f.content.join("\n") : f.content, crlf: false, create: true });
    continue;
  }
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  for (const p of f.patches) {
    const count = (content.match(toRegex(p.find)) || []).length;
    console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
    if (count !== 1) problems.push(f.path + " : " + p.name + " (" + count + " occurrence(s) au lieu de 1)");
  }
  results.push({ f, content, crlf });
}
if (problems.length > 0) fail("verifier :\n  - " + problems.join("\n  - "));

for (const r of results) {
  if (!r.create) for (const p of r.f.patches) r.content = r.content.replace(toRegex(p.find), () => p.replace.join("\n"));
}
for (const r of results.filter((x) => !x.create)) {
  for (const needle of r.f.finals) if (!r.content.includes(needle)) fail("controle final " + r.f.path + " : « " + needle + " » absent apres patch.");
  for (const bad of r.f.forbidden) if (r.content.includes(bad)) fail("controle final " + r.f.path + " : « " + bad + " » est toujours present apres patch.");
}
if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-lot3c1-panier-confirmation.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers (1 cree, 1 modifie).");
console.log("Etapes suivantes : git status --short, puis npm run build.");
console.log("Retour arriere avant commit : git restore pages/index.js, puis supprimer components/TransferInstructions.js");
