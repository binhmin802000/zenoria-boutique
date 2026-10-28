// ZENORIA - Lot 3c (correctif) : l'etape Livraison devient un ecran dedie dans le volet panier
// ============================================================
// Modifie UNIQUEMENT pages/index.js. Tout ou rien : un controle echoue -> rien n'est ecrit.
// A appliquer APRES patch-virement-affichage-modes.mjs ET patch-virement-parcours.mjs.
//
// Probleme corrige : le formulaire de livraison etait pose dans le pied du panier, dont la
// hauteur est limitee ; il ecrasait la liste des articles.
//
// Resultat :
//  - CARTE : panier strictement inchange (case CGV + bouton "Commander" au meme endroit).
//  - VIREMENT, ecran 1 (panier) : plus de formulaire ni de case CGV ; le bouton devient
//    "Continuer vers la livraison" (ouvre la connexion si la cliente n'est pas connectee).
//  - VIREMENT, ecran 2 (livraison) : "Retour au panier", recapitulatif, formulaire (zone
//    defilante), puis case CGV et bouton "Valider la commande avec obligation de paiement".
//  - retour automatique a l'ecran 1 si on ferme le panier, change de mode, se deconnecte
//    ou vide le panier.
// Usage : node scripts/patch-virement-etape-livraison.mjs --dry-run | --apply
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) { console.error("Utilisez --dry-run ou --apply."); process.exit(2); }

const file = path.join(process.cwd(), "pages", "index.js");
if (!fs.existsSync(file)) { console.error(`Fichier introuvable : ${file}`); process.exit(1); }
const original = fs.readFileSync(file, "utf8");
const EOL = /\r\n/.test(original) ? "\r\n" : "\n";
const fail = (m) => { console.error(`ECHEC : ${m}\nAucune modification n'a ete ecrite.`); process.exit(1); };
const count = (h, n) => { let c = 0, p = 0; while ((p = h.indexOf(n, p)) !== -1) { c++; p += n.length; } return c; };

if (original.includes("transfer-shipping-step")) { console.log("Deja applique : rien a faire."); process.exit(0); }
for (const [needle, what] of [
  ["const [transferResult, setTransferResult]", "etape 3c (patch-virement-parcours.mjs)"],
  ["const [paymentMethodsLoaded, setPaymentMethodsLoaded]", "etape 3a bis (patch-virement-affichage-modes.mjs)"],
  ['data-testid="transfer-shipping-form"', "formulaire de livraison de l'etape 3c"],
]) if (!original.includes(needle)) fail(`prerequis manquant : ${what} n'est pas appliquee.`);

let lines = original.split(/\r\n|\n/);
const indentOf = (i) => lines[i].match(/^(\s*)/)[1];
function findUnique(needle, label) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  if (idxs.length !== 1) fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  return idxs[0];
}
function blockOf(startNeedle, label, closeTrim) {
  const s = findUnique(startNeedle, label);
  const ind = indentOf(s);
  let e = -1;
  for (let i = s + 1; i < lines.length; i++) if (indentOf(i) === ind && lines[i].trim() === closeTrim) { e = i; break; }
  if (e === -1) fail(`${label} : fermeture ${JSON.stringify(closeTrim)} introuvable au meme niveau d'indentation.`);
  return { s, e, ind };
}
const reindent = (arr, target) => {
  const nonEmpty = arr.filter((l) => l.trim() !== "");
  const min = Math.min(...nonEmpty.map((l) => l.match(/^(\s*)/)[1].length));
  return arr.map((l) => (l.trim() === "" ? "" : " ".repeat(target) + l.slice(min)));
};
function replaceInLine(needle, label, from, to) {
  const i = findUnique(needle, label);
  if (count(lines[i], from) !== 1) fail(`${label} : fragment a remplacer introuvable sur la ligne.`);
  lines[i] = lines[i].replace(from, to);
  console.log(`OK repere : ${label}`);
}
function insertAfterLine(needle, label, build) {
  const i = findUnique(needle, label);
  lines = [...lines.slice(0, i + 1), ...build(indentOf(i)), ...lines.slice(i + 1)];
  console.log(`OK repere : ${label}`);
}

// 1 — etat cartStep
insertAfterLine("const [transferResult, setTransferResult] = useState(null);", "etat cartStep", (ind) => [
  `${ind}const [cartStep, setCartStep] = useState("cart"); // "cart" | "shipping" (virement : ecran Livraison dedie)`,
]);

// 2 — transferStep + retour automatique a l'ecran 1
insertAfterLine("const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);", "transferStep et retour automatique au panier", (ind) => [
  `${ind}const transferStep = paymentMethod === "transfer" && Boolean(user) && cartStep === "shipping";`,
  `${ind}useEffect(() => {`,
  `${ind}  if (!cartOpen || paymentMethod !== "transfer" || !user || cartLines.length === 0) setCartStep("cart");`,
  `${ind}}, [cartOpen, paymentMethod, user, cartLines.length]);`,
]);

// 3 — titre du volet
replaceInLine('<h3 className="font-serif text-2xl leading-none">Votre panier</h3>', "titre du volet",
  ">Votre panier</h3>", '>{transferStep ? "Livraison" : "Votre panier"}</h3>');

// 4 — le formulaire quitte le pied du panier (on garde son contenu tel quel)
let formInner;
{
  const { s, e } = blockOf('{paymentMethod === "transfer" && user && (', "formulaire de livraison dans le pied du panier", ")}");
  const inner = lines.slice(s + 1, e);
  if (!inner.join("\n").includes('data-testid="transfer-shipping-form"')) fail("le bloc repere ne contient pas le formulaire de livraison.");
  const opens = (inner.join("\n").match(/<div[\s>]/g) || []).length, closes = (inner.join("\n").match(/<\/div>/g) || []).length;
  if (opens !== closes) fail(`formulaire : balises <div> desequilibrees (${opens}/${closes}).`);
  formInner = inner;
  lines = [...lines.slice(0, s), ...lines.slice(e + 1)];
  console.log(`OK repere : formulaire retire du pied du panier (${e - s + 1} lignes)`);
}

// 5 — case CGV : copie pour l'ecran Livraison, et masquee dans le panier en mode virement
let cgvLines;
{
  const { s, e, ind } = blockOf('<label className="flex items-start gap-2 text-[12px] text-[#54434c] leading-5">', "case CGV du panier", "</label>");
  cgvLines = lines.slice(s, e + 1);
  if (!cgvLines.join("\n").includes('data-testid="cgv-checkbox"')) fail("le bloc repere ne contient pas la case CGV.");
  lines = [...lines.slice(0, s), `${ind}{paymentMethod !== "transfer" && (`, ...lines.slice(s, e + 1), `${ind})}`, ...lines.slice(e + 1)];
  console.log("OK repere : case CGV masquee dans le panier en mode virement (copiee pour l'ecran Livraison)");
}

// 6 — bouton "Commander" : en virement, il ouvre l'ecran Livraison
replaceInLine("onClick={handleCheckout}", "bouton Commander : action", "onClick={handleCheckout}",
  'onClick={paymentMethod === "transfer" ? () => { if (user) { setCheckoutError(""); setCartStep("shipping"); } else { setAuthModalMode("login"); setAuthModalOpen(true); } } : handleCheckout}');
replaceInLine("disabled={shopPaused || checkoutLoading || !cgvAccepted || !paymentMethodsLoaded", "bouton Commander : activation",
  "!cgvAccepted ||", '(paymentMethod !== "transfer" && !cgvAccepted) ||');
replaceInLine('"Valider la commande avec obligation de paiement" : "Commander"', "bouton Commander : libelle",
  '"Valider la commande avec obligation de paiement" : "Commander"', '"Continuer vers la livraison" : "Commander"');

// 7 — ecran Livraison : branche du ternaire du volet
{
  const a = findUnique('<div className="flex-none px-5 pt-3 pb-2">', "debut du contenu du panier");
  if (lines[a - 1].trim() !== "<>" || lines[a - 2].trim() !== ") : (") fail("structure inattendue autour du contenu du panier (<> / ) : ( attendus).");
  const ind = indentOf(a - 2);
  const p = (n) => " ".repeat(n);
  const base = ind.length + 2; // niveau de <>
  const branch = [
    `${ind}) : transferStep ? (`,
    `${p(base)}<>`,
    `${p(base + 2)}<div data-testid="transfer-shipping-step" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">`,
    `${p(base + 4)}<button type="button" onClick={() => { setCartStep("cart"); setCheckoutError(""); }} data-testid="transfer-back-to-cart" className="text-sm text-[#8f6075] underline">← Retour au panier</button>`,
    `${p(base + 4)}<div data-testid="transfer-recap" className="rounded-xl bg-white border border-[#eee2e5] px-4 py-3 text-sm text-[#54434c] space-y-1">`,
    `${p(base + 6)}<div className="flex justify-between"><span>{cartCount} article{cartCount > 1 ? "s" : ""}</span><span>{formatPrice(totals.subtotal)}</span></div>`,
    `${p(base + 6)}{totals.discount > 0 && (<div className="flex justify-between text-emerald-700"><span>Remise</span><span>-{formatPrice(totals.discount)}</span></div>)}`,
    `${p(base + 6)}<div className="flex justify-between"><span>Livraison (France)</span><span>{totals.shipping === 0 ? "Offerte" : formatPrice(totals.shipping)}</span></div>`,
    `${p(base + 6)}<div className="flex justify-between font-serif text-lg text-[#342b32] border-t border-[#eadfe4] pt-2 mt-2"><span>Total à virer</span><span>{formatPrice(totals.total)}</span></div>`,
    `${p(base + 4)}</div>`,
    ...reindent(formInner, base + 4),
    `${p(base + 2)}</div>`,
    `${p(base + 2)}<div className="flex-none border-t border-[#eadfe4] bg-white/80 px-5 py-4 space-y-3">`,
    ...reindent(cgvLines, base + 4),
    `${p(base + 4)}<button`,
    `${p(base + 6)}onClick={handleCheckout}`,
    `${p(base + 6)}disabled={shopPaused || checkoutLoading || !cgvAccepted}`,
    `${p(base + 6)}data-testid="transfer-submit-button"`,
    `${p(base + 6)}className="w-full h-12 rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c]"`,
    `${p(base + 4)}>`,
    `${p(base + 6)}{shopPaused ? "Commandes temporairement fermées" : checkoutLoading ? "Enregistrement de la commande..." : "Valider la commande avec obligation de paiement"}`,
    `${p(base + 4)}</button>`,
    `${p(base + 4)}{checkoutError && (`,
    `${p(base + 6)}<p role="alert" className="text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5">{checkoutError}</p>`,
    `${p(base + 4)})}`,
    `${p(base + 2)}</div>`,
    `${p(base)}</>`,
    `${ind}) : (`,
  ];
  lines = [...lines.slice(0, a - 2), ...branch, ...lines.slice(a - 1)];
  console.log("OK repere : ecran Livraison insere dans le volet panier");
}

const text = lines.join(EOL);

// Garde-fous finaux
for (const n of ['data-testid="transfer-shipping-step"', 'data-testid="transfer-shipping-form"', 'data-testid="transfer-submit-button"', 'data-testid="transfer-recap"',
  'data-testid="checkout-button"', 'data-testid="payment-method-card"', 'data-testid="payment-method-transfer"', 'data-testid="transfer-confirmation"', 'fetch("/api/checkout"'])
  if (count(text, n) !== 1) fail(`garde-fou final : ${JSON.stringify(n)} doit apparaitre exactement une fois (trouve ${count(text, n)}).`);
if (count(text, 'data-testid="cgv-checkbox"') !== 2) fail(`garde-fou final : la case CGV doit exister 2 fois (panier carte + ecran Livraison), trouve ${count(text, 'data-testid="cgv-checkbox"')}.`);
if (count(text, "cartStep") + count(text, "CartStep") < 6) fail(`garde-fou final : cartStep incomplet (${count(text, "cartStep") + count(text, "CartStep")}).`);
if (text.indexOf('data-testid="transfer-shipping-form"') < text.indexOf('data-testid="transfer-shipping-step"')) fail("garde-fou final : le formulaire n'est pas dans l'ecran Livraison.");
if (count(text, "{paymentMethod !== \"transfer\" && (") !== 1) fail("garde-fou final : masquage de la case CGV absent ou en double.");
if (text === original) fail("aucune modification produite.");
console.log("OK garde-fou : ecran Livraison integre, carte et blocs de 3a bis intacts");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else { fs.writeFileSync(file, text, "utf8"); console.log("Fichier modifie : pages\\index.js"); }
