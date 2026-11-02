#!/usr/bin/env node
// ============================================================
// PATCH LOT 2c-4 : vitrine, « Quiz colorimétrie » et logo de la confirmation de paiement
// (a appliquer sur la branche lot2c-stock-ecrans, APRES les patchs 2c-1, 2c-2, complement et pastille)
//   - « Écrivez-nous » (icone stylo) pour TOUTE bague non commandable : carte du catalogue et panneau « Mes favoris »,
//     avec le message prerempli adapte (epuise, piece reservee, piece vendue)
//   - panier vide : le message (« n'est plus disponible »...) s'affiche ; il s'efface a la fermeture du panier
//   - « Quiz couleurs » devient « Quiz colorimétrie » (accueil, page du quiz, aides de l'admin, cible du bandeau)
//     Le menu « Quiz » et le bouton « Lancer le quiz » restent inchanges.
//   - fenetre « Merci pour votre confiance » : le logo du site (CrystalLogo) remplace l'image hebergee qui ne s'affichait plus
// Aucune base de donnees.
//   node scripts/patch-lot2c4-vitrine-quiz-logo.mjs --dry-run
//   node scripts/patch-lot2c4-vitrine-quiz-logo.mjs --apply
// ============================================================
import fs from "node:fs";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "components/ProductParts.js",
  "patches": [
   {
    "name": "PP1 icone stylo",
    "find": [
     "import { buildMailtoLink, buildWhatsAppLink } from \"@/lib/contactSettings\"; // ZENORIA_STOCK_UI_V1"
    ],
    "replace": [
     "import { buildMailtoLink, buildWhatsAppLink } from \"@/lib/contactSettings\"; // ZENORIA_STOCK_UI_V1",
     "import { Pencil } from \"lucide-react\"; // ZENORIA_2C4_V1"
    ],
    "sig": "import { Pencil } from \"lucide-react\";"
   },
   {
    "name": "PP2 « Ecrivez-nous » pour toute bague non commandable",
    "find": [
     "export function CatalogWriteUs({ product, contactSettings }) {",
     "if (!product) return null;",
     "const link = contactLink(",
     "contactSettings,",
     "`À propos de « ${product.name} »`,",
     "`Bonjour,\\n\\nJe souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?\\n`,",
     "`Bonjour, je souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?`",
     ");",
     "const cls = \"flex w-full mt-5 h-10 items-center justify-center rounded-full border border-[#d9c5cc] text-sm text-[#8f6075] hover:bg-[#f5edf1] transition\";",
     "return link ? (",
     "<a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" data-testid=\"catalog-write-us\" className={cls}>",
     "Écrivez-nous",
     "</a>",
     ") : (",
     "<span data-testid=\"catalog-write-us\" className={cls}>Épuisé</span>",
     ");",
     "}"
    ],
    "replace": [
     "// ZENORIA_2C4_V1 : « Écrivez-nous » (icône stylo) pour TOUTE bague non commandable : bijou épuisé, pièce unique réservée ou vendue.",
     "// Le message prérempli dépend de l'état (textes validés). compact : version réduite (panneau « Mes favoris »).",
     "export function CatalogWriteUs({ product, contactSettings, compact = false }) {",
     "  if (!product) return null;",
     "  const a = getAvailability(product);",
     "  const [emailBody, waText] =",
     "    a.state === \"sold\"",
     "      ? [",
     "          `Bonjour,\\n\\nLe modèle « ${product.name} » m'a touchée, et j'aimerais en savoir plus sur une création qui s'en inspire.\\n`,",
     "          `Bonjour, le modèle « ${product.name} » m'a touchée, j'aimerais en savoir plus sur une création qui s'en inspire.`,",
     "        ]",
     "      : a.state === \"reserved\"",
     "      ? [",
     "          `Bonjour,\\n\\nLa pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?\\n`,",
     "          `Bonjour, la pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?`,",
     "        ]",
     "      : [",
     "          `Bonjour,\\n\\nJe souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?\\n`,",
     "          `Bonjour, je souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?`,",
     "        ];",
     "  const link = contactLink(contactSettings, `À propos de « ${product.name} »`, emailBody, waText);",
     "  const cls = compact",
     "    ? \"inline-flex items-center gap-1.5 rounded-full border border-[#d9c5cc] px-3 py-1 text-xs text-[#8f6075] hover:bg-[#f5edf1] transition\"",
     "    : \"flex w-full mt-5 h-10 items-center justify-center gap-2 rounded-full border border-[#d9c5cc] text-sm text-[#8f6075] hover:bg-[#f5edf1] transition\";",
     "  return link ? (",
     "    <a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" data-testid=\"catalog-write-us\" data-state={a.state} className={cls}>",
     "      <Pencil size={compact ? 12 : 15} aria-hidden=\"true\" />",
     "      Écrivez-nous",
     "    </a>",
     "  ) : (",
     "    <span data-testid=\"catalog-write-us\" data-state={a.state} className={cls}>{a.label}</span>",
     "  );",
     "}"
    ],
    "sig": "compact = false"
   }
  ]
 },
 {
  "path": "pages/index.js",
  "patches": [
   {
    "name": "IX1 carte : toute bague non commandable",
    "find": [
     "{p.isUnique !== true && !getAvailability(p).orderable ? ("
    ],
    "replace": [
     "{!getAvailability(p).orderable /* ZENORIA_2C4_V1 : toute bague non commandable */ ? ("
    ],
    "sig": "/* ZENORIA_2C4_V1"
   },
   {
    "name": "IX2 panier vide : message visible",
    "find": [
     "<ShoppingBag className=\"mx-auto text-[#b88d9f] mb-4\" size={40} />",
     "<div className=\"font-serif text-2xl mb-2\">Votre panier est vide</div>"
    ],
    "replace": [
     "{cartNotice && (",
     "                      <div data-testid=\"empty-cart-notice\" className=\"mb-5 text-xs rounded-lg bg-amber-50 text-amber-700 px-3 py-2\">{cartNotice}</div>",
     "                    )}",
     "                    <ShoppingBag className=\"mx-auto text-[#b88d9f] mb-4\" size={40} />",
     "                    <div className=\"font-serif text-2xl mb-2\">Votre panier est vide</div>"
    ],
    "sig": "data-testid=\"empty-cart-notice\""
   },
   {
    "name": "IX3 message efface a la fermeture du panier",
    "find": [
     "if (!cartOpen) { setCheckoutError(\"\"); setPieceUnavailableIds([]); }"
    ],
    "replace": [
     "if (!cartOpen) { setCheckoutError(\"\"); setPieceUnavailableIds([]); setCartNotice(\"\"); }"
    ],
    "sig": "setPieceUnavailableIds([]); setCartNotice(\"\"); }"
   },
   {
    "name": "IX4 favoris : « Ecrivez-nous » si non commandable",
    "find": [
     "<button",
     "type=\"button\"",
     "onClick={() => { addToCart(p); setFavPanelOpen(false); }}",
     "className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs\"",
     ">",
     "Ajouter au panier",
     "</button>"
    ],
    "replace": [
     "{getAvailability(p).orderable ? (",
     "                            <button",
     "                              type=\"button\"",
     "                              onClick={() => { addToCart(p); setFavPanelOpen(false); }}",
     "                              className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs\"",
     "                            >",
     "                              Ajouter au panier",
     "                            </button>",
     "                          ) : (",
     "                            <CatalogWriteUs product={p} contactSettings={contactSettings} compact />",
     "                          )}"
    ],
    "sig": "contactSettings={contactSettings} compact />"
   },
   {
    "name": "IX5 bouton de l'accueil",
    "find": [
     "Faire le quiz couleurs"
    ],
    "replace": [
     "Faire le quiz colorimétrie"
    ],
    "sig": "Faire le quiz colorimétrie"
   },
   {
    "name": "IX6 carte « L'univers Zenoria »",
    "find": [
     "<div className=\"font-serif text-xl mb-1 text-[#412f3b]\">Le quiz couleurs</div>"
    ],
    "replace": [
     "<div className=\"font-serif text-xl mb-1 text-[#412f3b]\">Le quiz colorimétrie</div>"
    ],
    "sig": ">Le quiz colorimétrie</div>"
   },
   {
    "name": "IX7 bloc d'invitation : surtitre",
    "find": [
     "<div className=\"text-xs tracking-[.3em] text-[#956d83] uppercase mb-3\">Quiz couleurs</div>"
    ],
    "replace": [
     "<div className=\"text-xs tracking-[.3em] text-[#956d83] uppercase mb-3\">Quiz colorimétrie</div>"
    ],
    "sig": "uppercase mb-3\">Quiz colorimétrie</div>"
   }
  ]
 },
 {
  "path": "components/PaymentConfirmationModal.js",
  "patches": [
   {
    "name": "PC1 import du logo du site",
    "find": [
     "import { X } from \"lucide-react\";"
    ],
    "replace": [
     "import { X } from \"lucide-react\";",
     "import CrystalLogo from \"@/components/CrystalLogo\"; // ZENORIA_2C4_V1 : logo unifié du site (l'ancienne image hébergée ne s'affichait plus)"
    ],
    "sig": "import CrystalLogo from"
   },
   {
    "name": "PC2 ancienne adresse d'image retiree",
    "find": [
     "// Logo Zenoria, déjà hébergé dans Supabase Storage (réutilisé depuis le",
     "// modèle d'e-mail « mot de passe oublié »).",
     "const LOGO_URL =",
     "\"https://dnzrssuclesccxgcurwz.supabase.co/storage/v1/object/public/product-media/Logos/zenoria_logo_horizontal_fond_blanc.png\";"
    ],
    "replace": [
     "// Logo : composant CrystalLogo, le même que l'en-tête du site (plus d'image hébergée à part)."
    ],
    "sig": "le même que l'en-tête du site"
   },
   {
    "name": "PC3 logo affiche",
    "find": [
     "<img src={LOGO_URL} alt=\"Zenoria\" className=\"h-10 mx-auto mb-6 object-contain\" />"
    ],
    "replace": [
     "<div className=\"flex justify-center mb-6\"><CrystalLogo compact mode={1} /></div>"
    ],
    "sig": "<CrystalLogo compact mode={1} />"
   }
  ]
 },
 {
  "path": "pages/quiz.js",
  "patches": [
   {
    "name": "QZ1 titre de l'onglet",
    "find": [
     "<title>Quiz couleurs — Zenoria</title>"
    ],
    "replace": [
     "<title>Quiz colorimétrie — Zenoria</title>"
    ],
    "sig": "Quiz colorimétrie — Zenoria"
   },
   {
    "name": "QZ2 surtitre de la page",
    "find": [
     "<div className=\"text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3\">Quiz couleurs</div>"
    ],
    "replace": [
     "<div className=\"text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3\">Quiz colorimétrie</div>"
    ],
    "sig": "text-[#9c7285] uppercase mb-3\">Quiz colorimétrie"
   }
  ]
 },
 {
  "path": "pages/admin.js",
  "patches": [
   {
    "name": "AD1 aide « collections voisines »",
    "find": [
     "Le quiz couleurs peut proposer cette collection"
    ],
    "replace": [
     "Le quiz colorimétrie peut proposer cette collection"
    ],
    "sig": "Le quiz colorimétrie peut proposer"
   },
   {
    "name": "AD2 aide « couleurs dominantes »",
    "find": [
     "Le quiz couleurs s&apos;en sert"
    ],
    "replace": [
     "Le quiz colorimétrie s&apos;en sert"
    ],
    "sig": "Le quiz colorimétrie s&apos;en sert"
   }
  ]
 },
 {
  "path": "components/AdminFamilies.js",
  "patches": [
   {
    "name": "AF1 aide des familles",
    "find": [
     "Les saisons alimentent le quiz couleurs"
    ],
    "replace": [
     "Les saisons alimentent le quiz colorimétrie"
    ],
    "sig": "alimentent le quiz colorimétrie"
   }
  ]
 },
 {
  "path": "lib/banners.js",
  "patches": [
   {
    "name": "BN1 cible du bandeau",
    "find": [
     "{ value: \"quiz\", label: \"Quiz couleurs\" },"
    ],
    "replace": [
     "{ value: \"quiz\", label: \"Quiz colorimétrie\" },"
    ],
    "sig": "label: \"Quiz colorimétrie\""
   }
  ]
 },
 {
  "path": "lib/siteTexts.js",
  "patches": [
   {
    "name": "ST1 aide de l'admin (textes du site)",
    "find": [
     "qui invite à faire le quiz couleurs."
    ],
    "replace": [
     "qui invite à faire le quiz colorimétrie."
    ],
    "sig": "faire le quiz colorimétrie."
   }
  ]
 }
];
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(esc(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = []; const problems = []; let already = 0; let total = 0;
for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (f.path === "components/ProductParts.js" && !content.includes("ZENORIA_STOCK_UI2_V1")) fail("le patch 2c-2 n'est pas applique (appliquez d'abord patch-lot2c2-panier.mjs).");
  const before = problems.length;
  for (const p of f.patches) {
    total++;
    const c = (content.match(toRegex(p.find)) || []).length;
    if (content.includes(p.sig)) { already++; console.log(" DEJA  " + p.name + " : deja applique"); problems.push(f.path + " : " + p.name + " deja applique"); continue; }
    console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)");
    if (c !== 1) problems.push(f.path + " : " + p.name + " (" + c + " occurrence(s) au lieu de 1)");
  }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (already === total) fail("le patch est deja applique en entier.");
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) for (const p of r.f.patches) if (!r.content.includes(p.sig)) fail("controle final " + r.f.path + " : " + p.name + " absent apres patch.");
const idx = results.find((r) => r.f.path === "pages/index.js");
if (idx && /Quiz couleurs|quiz couleurs/.test(idx.content.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""))) fail("controle final : « quiz couleurs » encore visible dans pages/index.js.");
const pc = results.find((r) => r.f.path === "components/PaymentConfirmationModal.js");
if (pc && pc.content.includes("LOGO_URL")) fail("controle final : LOGO_URL encore present.");
if (mode === "dry") { console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Retour arriere avant commit : git restore " + FILES.map((f) => f.path).join(" "));
