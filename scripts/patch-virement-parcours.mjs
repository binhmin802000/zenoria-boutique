// ZENORIA - Lot 3c+3d (virement) v2 : livraison, bouton Commander, confirmation provisoire
// ============================================================
// Modifie UNIQUEMENT pages/index.js. Tout ou rien : un controle echoue -> rien n'est ecrit.
// A appliquer APRES patch-virement-affichage-modes.mjs (3a bis).
// Ajoute :
//  - etats transferShipping et transferResult
//  - submitTransferOrder (POST /api/checkout-transfer, jeton Bearer)
//  - bifurcation dans handleCheckout : virement -> submitTransferOrder ; carte inchangee
//  - formulaire de livraison (France, telephone facultatif) si virement + connectee
//  - bouton Commander : libelle adapte, bloque tant que les reglages ne sont pas charges
//    ou si aucun moyen de paiement n'est actif
//  - fenetre de confirmation PROVISOIRE (n°, montant, echeance) ; IBAN/reference = etape 3e
// Usage : node scripts/patch-virement-parcours.mjs --dry-run | --apply
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

if (original.includes("submitTransferOrder")) { console.log("Deja applique : rien a faire."); process.exit(0); }

// --- Prerequis : 3a bis appliquee, et etats du panier presents (rien n'est suppose) ---
if (!original.includes("const [paymentMethodsLoaded, setPaymentMethodsLoaded]"))
  fail("l'etape 3a bis n'est pas appliquee (paymentMethodsLoaded absent). Lancez d'abord patch-virement-affichage-modes.mjs.");
if (!/const \[cartItems, setCartItems\] = useState/.test(original)) fail("etat du panier [cartItems, setCartItems] introuvable.");
if (!/const \[cartOpen, setCartOpen\] = useState/.test(original)) fail("etat [cartOpen, setCartOpen] introuvable.");
if (!/const \[promoCode, setPromoCode\] = useState/.test(original)) fail("etat [promoCode, setPromoCode] introuvable.");
// Vider le panier : on reutilise clearCart s'il existe, sinon on vide l'etat directement.
const hasClearCart = /(const clearCart\s*=|function clearCart\s*\()/.test(original);
const CLEAR_STMT = hasClearCart ? "clearCart();" : 'setCartItems([]); setPromoCode("");';
console.log(`OK prerequis : 3a bis appliquee ; vidage du panier par ${hasClearCart ? "clearCart()" : "setCartItems([]) + setPromoCode(\"\")"}`);

let lines = original.split(/\r\n|\n/);
const indentOf = (i) => lines[i].match(/^(\s*)/)[1];
function findUnique(needle, label) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  if (idxs.length !== 1) fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  return idxs[0];
}
function insertAt(i, label, block) { lines = [...lines.slice(0, i), ...block, ...lines.slice(i)]; console.log(`OK repere : ${label}`); }
function insertBefore(needle, label, build) { const i = findUnique(needle, label); insertAt(i, label, build(indentOf(i))); }
function insertAfter(needle, label, build) { const i = findUnique(needle, label); insertAt(i + 1, label, build(indentOf(i))); }
function replaceInLine(needle, label, from, to) {
  const i = findUnique(needle, label);
  if (count(lines[i], from) !== 1) fail(`${label} : fragment a remplacer introuvable sur la ligne.`);
  lines[i] = lines[i].replace(from, to);
  console.log(`OK repere : ${label}`);
}

// A — etats
insertAfter("const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);", "etats transferShipping / transferResult", (ind) => [
  `${ind}const [transferShipping, setTransferShipping] = useState({ fullName: "", line1: "", line2: "", postalCode: "", city: "", phone: "" });`,
  `${ind}const [transferResult, setTransferResult] = useState(null); // { orderId, total, dueAt } apres une commande par virement`,
]);

// B — bifurcation : repere DANS handleCheckout (premiere ligne setCheckoutLoading(true) apres sa declaration)
{
  const h = findUnique("const handleCheckout = async () => {", "declaration de handleCheckout");
  let target = -1;
  for (let i = h + 1; i < Math.min(lines.length, h + 25); i++) if (lines[i].trim() === "setCheckoutLoading(true);") { target = i; break; }
  if (target === -1) fail("setCheckoutLoading(true) introuvable dans les 25 lignes de handleCheckout.");
  const ctx = lines.slice(h, target).join(" ");
  if (!ctx.includes("cgvAccepted") || !ctx.includes("conditions générales de vente")) fail("la bifurcation ne serait pas placee apres la verification des CGV.");
  const ind = indentOf(target);
  insertAt(target, "bifurcation virement dans handleCheckout", [
    `${ind}if (paymentMethod === "transfer") {`,
    `${ind}  await submitTransferOrder();`,
    `${ind}  return;`,
    `${ind}}`,
  ]);
}

// C — fonction submitTransferOrder, juste avant handleCheckout
insertBefore("const handleCheckout = async () => {", "fonction submitTransferOrder", (ind) => [
  `${ind}// Virement : la commande est creee cote serveur (/api/checkout-transfer), qui relit les prix en base.`,
  `${ind}const submitTransferOrder = async () => {`,
  `${ind}  if (!user) {`,
  `${ind}    setCheckoutError("Un compte est nécessaire pour payer par virement. Connectez-vous ou créez votre compte.");`,
  `${ind}    return;`,
  `${ind}  }`,
  `${ind}  const name = transferShipping.fullName.trim();`,
  `${ind}  const line1 = transferShipping.line1.trim();`,
  `${ind}  const postalCode = transferShipping.postalCode.trim();`,
  `${ind}  const city = transferShipping.city.trim();`,
  `${ind}  if (!name || !line1 || !city || !/^[0-9]{5}$/.test(postalCode)) {`,
  `${ind}    setCheckoutError("Merci de compléter votre adresse de livraison (code postal à 5 chiffres).");`,
  `${ind}    return;`,
  `${ind}  }`,
  `${ind}  setCheckoutLoading(true);`,
  `${ind}  try {`,
  `${ind}    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();`,
  `${ind}    const token = sessionData && sessionData.session ? sessionData.session.access_token : null;`,
  `${ind}    if (sessionError || !token) throw new Error("Session indisponible");`,
  `${ind}    const res = await fetch("/api/checkout-transfer", {`,
  `${ind}      method: "POST",`,
  `${ind}      headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },`,
  `${ind}      body: JSON.stringify({`,
  `${ind}        items: cartItems.map((it) => ({ id: it.id, qty: it.qty })),`,
  `${ind}        promoCode: promoCode || null,`,
  `${ind}        shipping: { fullName: name, line1, line2: transferShipping.line2.trim() || null, postalCode, city, phone: transferShipping.phone.trim() || null },`,
  `${ind}      }),`,
  `${ind}    });`,
  `${ind}    const data = await res.json();`,
  `${ind}    if (data && data.ok) {`,
  `${ind}      ${CLEAR_STMT}`,
  `${ind}      setCartOpen(false);`,
  `${ind}      setCgvAccepted(false);`,
  `${ind}      setTransferResult({ orderId: data.orderId, total: data.total, dueAt: data.dueAt });`,
  `${ind}    } else {`,
  `${ind}      setCheckoutError((data && data.error) || "Impossible d'enregistrer la commande. Merci de réessayer.");`,
  `${ind}    }`,
  `${ind}  } catch (e) {`,
  `${ind}    setCheckoutError("Impossible de contacter le service. Vérifiez votre connexion et réessayez.");`,
  `${ind}  }`,
  `${ind}  setCheckoutLoading(false);`,
  `${ind}};`,
]);

// D — formulaire de livraison, juste avant la case CGV
insertBefore('<label className="flex items-start gap-2 text-[12px] text-[#54434c] leading-5">', "formulaire de livraison (virement)", (ind) => {
  const inp = 'className="w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]"';
  const set = (k) => `onChange={(e) => setTransferShipping((s) => ({ ...s, ${k}: e.target.value }))}`;
  return [
    `${ind}{paymentMethod === "transfer" && user && (`,
    `${ind}  <div data-testid="transfer-shipping-form" className="space-y-2">`,
    `${ind}    <div className="text-[13px] font-medium text-[#412f3b]">Livraison (France)</div>`,
    `${ind}    <input value={transferShipping.fullName} ${set("fullName")} placeholder="Nom et prénom" autoComplete="name" data-testid="transfer-ship-name" ${inp} />`,
    `${ind}    <input value={transferShipping.line1} ${set("line1")} placeholder="Adresse" autoComplete="address-line1" data-testid="transfer-ship-line1" ${inp} />`,
    `${ind}    <input value={transferShipping.line2} ${set("line2")} placeholder="Complément d'adresse (facultatif)" autoComplete="address-line2" data-testid="transfer-ship-line2" ${inp} />`,
    `${ind}    <div className="grid grid-cols-3 gap-2">`,
    `${ind}      <input value={transferShipping.postalCode} ${set("postalCode")} placeholder="Code postal" inputMode="numeric" maxLength={5} autoComplete="postal-code" data-testid="transfer-ship-postal" ${inp} />`,
    `${ind}      <input value={transferShipping.city} ${set("city")} placeholder="Ville" autoComplete="address-level2" data-testid="transfer-ship-city" className="col-span-2 w-full rounded-xl border border-[#d9c5cc] bg-white px-3 h-9 text-sm outline-none focus:border-[#8f6075]" />`,
    `${ind}    </div>`,
    `${ind}    <input value={transferShipping.phone} ${set("phone")} placeholder="Téléphone (facultatif)" inputMode="tel" autoComplete="tel" data-testid="transfer-ship-phone" ${inp} />`,
    `${ind}    <p className="text-[11px] text-[#8b737e]">Livraison en France uniquement. L&apos;adresse e-mail de votre compte est utilisée pour cette commande.</p>`,
    `${ind}  </div>`,
    `${ind})}`,
  ];
});

// E — bouton Commander
replaceInLine("disabled={shopPaused || checkoutLoading || !cgvAccepted}", "bouton Commander : desactivation",
  "disabled={shopPaused || checkoutLoading || !cgvAccepted}",
  "disabled={shopPaused || checkoutLoading || !cgvAccepted || !paymentMethodsLoaded || (!paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled)}");
replaceInLine('checkoutLoading ? "Redirection vers le paiement..." : "Commander"', "bouton Commander : libelles",
  'checkoutLoading ? "Redirection vers le paiement..." : "Commander"',
  'checkoutLoading ? (paymentMethod === "transfer" ? "Enregistrement de la commande..." : "Redirection vers le paiement...") : paymentMethod === "transfer" ? "Valider la commande avec obligation de paiement" : "Commander"');

// F — confirmation provisoire
insertBefore("{/* CONFIRMATION DE PAIEMENT (retour de Stripe Checkout) */}", "confirmation provisoire du virement", (ind) => [
  `${ind}{/* CONFIRMATION DE COMMANDE PAR VIREMENT (provisoire : IBAN et reference a l'etape 3e) */}`,
  `${ind}{transferResult && (`,
  `${ind}  <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" data-testid="transfer-confirmation">`,
  `${ind}    <div className="w-full max-w-md rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">`,
  `${ind}      <h3 className="font-serif text-2xl text-[#412f3b]">Commande enregistrée</h3>`,
  `${ind}      <p className="mt-3 text-sm text-[#54434c]">Commande n°{transferResult.orderId} · {formatPrice(Number(transferResult.total))}</p>`,
  `${ind}      <p className="mt-1 text-sm text-[#54434c]">À régler par virement avant le {new Date(transferResult.dueAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" })}.</p>`,
  `${ind}      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900">Étape en cours de construction : les coordonnées bancaires et la référence seront affichées ici. Retrouvez cette commande dans Mon compte.</p>`,
  `${ind}      <button type="button" onClick={() => setTransferResult(null)} data-testid="transfer-confirmation-close" className="mt-5 w-full rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm">Fermer</button>`,
  `${ind}    </div>`,
  `${ind}  </div>`,
  `${ind})}`,
]);

const text = lines.join(EOL);

// Garde-fous finaux
for (const [n, min] of [["submitTransferOrder", 2], ["transferShipping", 7], ["transferResult", 5], ["/api/checkout-transfer", 1], ["!paymentMethodsLoaded", 1]])
  if (count(text, n) < min) fail(`garde-fou final : ${JSON.stringify(n)} attendu au moins ${min} fois, trouve ${count(text, n)}.`);
for (const n of ['data-testid="transfer-shipping-form"', 'data-testid="transfer-confirmation"', 'fetch("/api/checkout"', 'data-testid="cgv-checkbox"',
  'data-testid="checkout-button"', 'data-testid="payment-method-card"', 'data-testid="payment-method-transfer"', 'data-testid="transfer-only-notice"'])
  if (count(text, n) !== 1) fail(`garde-fou final : ${JSON.stringify(n)} doit apparaitre exactement une fois (trouve ${count(text, n)}).`);
if (!hasClearCart && /(^|[^.\w])clearCart\(/.test(text)) fail("garde-fou final : clearCart() est appele alors qu'il n'est pas defini.");
if (text === original) fail("aucune modification produite.");
console.log("OK garde-fou : parcours virement integre, appel Stripe et blocs de 3a bis intacts");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else { fs.writeFileSync(file, text, "utf8"); console.log("Fichier modifie : pages\\index.js"); }
