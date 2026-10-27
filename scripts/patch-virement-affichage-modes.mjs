// ZENORIA - Lot 3a bis (virement) : l'ecran de paiement suit les reglages de l'admin
// ============================================================
// Modifie UNIQUEMENT pages/index.js. Tout ou rien : un controle echoue -> rien n'est ecrit.
//
// Regles appliquees :
//  - carte seule      : panier identique a l'ancien (aucun selecteur, aucun bloc ajoute)
//  - virement seul    : aucune trace de la carte ; bloc "Paiement par virement bancaire"
//  - les deux         : selecteur Carte / Virement (aucun bouton grise)
//  - aucun            : message "Aucun moyen de paiement n'est disponible"
//  - le lien "Choisir la carte" n'existe que si la carte est active
//  - la ligne "Deja cliente ? ... (facultatif)" n'existe que pour la carte
//  - "Paiement securise via Stripe" n'existe que si la carte est active ET choisie
//  - plus de delai "3 jours" ecrit en dur (la date limite reelle est donnee a la confirmation)
//  - un indicateur "reglages charges" evite d'afficher un mode le temps du chargement
//
// Fonctionne avant OU apres patch-virement-parcours.mjs.
// Usage : node scripts/patch-virement-affichage-modes.mjs --dry-run | --apply
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

if (original.includes("transfer-only-notice")) { console.log("Deja applique : rien a faire."); process.exit(0); }

let lines = original.split(/\r\n|\n/);
const indentOf = (i) => lines[i].match(/^(\s*)/)[1];
function findUnique(needle, label) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  if (idxs.length !== 1) fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  return idxs[0];
}
function insertAfter(needle, label, build) {
  const i = findUnique(needle, label);
  lines = [...lines.slice(0, i + 1), ...build(indentOf(i)), ...lines.slice(i + 1)];
  console.log(`OK repere : ${label}`);
}

// A — indicateur "reglages charges"
insertAfter("const [paymentMethodsCfg, setPaymentMethodsCfg] = useState(DEFAULT_PAYMENT_METHODS);", "etat paymentMethodsLoaded",
  (ind) => [`${ind}const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);`]);

// B — passe a vrai une fois les reglages lus
insertAfter("setPaymentMethodsCfg(parsePaymentMethods(paymentRow ? paymentRow.value : null));", "fin du chargement des reglages de paiement",
  (ind) => [`${ind}setPaymentMethodsLoaded(true);`]);

// C — remplacement du bloc "choix du moyen de paiement"
{
  const s = findUnique('data-testid="payment-method-choice"', "debut du bloc de choix du moyen de paiement");
  const anchors = [];
  lines.forEach((l, i) => {
    if (l.includes("{!user && (") && lines.slice(i, i + 3).some((x) => x.includes("account-choice-line"))) anchors.push(i);
  });
  if (anchors.length !== 1) fail(`ligne "Deja cliente ?" : attendu 1 ancre, trouve ${anchors.length}.`);
  const a = anchors[0];
  let e = a - 1;
  while (e > s && lines[e].trim() === "") e--;
  if (!(s < e && e < a)) fail("bornes du bloc de choix incoherentes.");
  if (lines[e].trim() !== "</div>") fail("le bloc de choix ne se termine pas par </div> juste avant la ligne \"Deja cliente ?\".");
  const old = lines.slice(s, e + 1).join("\n");
  for (const t of ['data-testid="payment-method-card"', 'data-testid="payment-method-transfer"', 'data-testid="transfer-auth-required"'])
    if (!old.includes(t)) fail(`bloc de choix : ${t} absent du bloc repere.`);
  const opens = (old.match(/<div[\s>]/g) || []).length, closes = (old.match(/<\/div>/g) || []).length;
  if (opens !== closes) fail(`bloc de choix : balises <div> desequilibrees (${opens}/${closes}).`);

  const ind = indentOf(s);
  const btn = (method, label, sub) => [
    `${ind}        <button`,
    `${ind}          type="button"`,
    `${ind}          onClick={() => { setPaymentMethod("${method}"); setCheckoutError(""); }}`,
    `${ind}          data-testid="payment-method-${method}"`,
    `${ind}          className={\`rounded-xl border px-3 py-2 text-sm text-left transition \${paymentMethod === "${method}" ? "border-[#8f6075] bg-[#f5edf1] text-[#412f3b]" : "border-[#d9c5cc] text-[#70656a] hover:bg-[#fbf7f9]"}\`}`,
    `${ind}        >`,
    `${ind}          ${label}`,
    `${ind}          <div className="text-[11px] text-[#8b737e] mt-0.5">${sub}</div>`,
    `${ind}        </button>`,
  ];
  const block = [
    `${ind}{paymentMethodsLoaded && paymentMethodsCfg.transfer_enabled && (`,
    `${ind}  <div data-testid="payment-method-choice" className="space-y-2">`,
    `${ind}    {paymentMethodsCfg.stripe_enabled ? (`,
    `${ind}      <>`,
    `${ind}        <div className="text-[13px] font-medium text-[#412f3b]">Moyen de paiement</div>`,
    `${ind}        <div className="grid grid-cols-2 gap-2">`,
    ...btn("card", "Carte bancaire", "Paiement immédiat et sécurisé"),
    ...btn("transfer", "Virement bancaire", "Commande réservée, à régler après validation"),
    `${ind}        </div>`,
    `${ind}      </>`,
    `${ind}    ) : (`,
    `${ind}      <div data-testid="transfer-only-notice" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-2.5">`,
    `${ind}        <div className="text-[13px] font-medium text-[#412f3b]">Paiement par virement bancaire</div>`,
    `${ind}        <p className="mt-1 text-[12px] leading-5 text-[#54434c]">Vous validez votre commande, puis vous recevez les coordonnées bancaires et votre référence. Votre commande est réservée dans l&apos;attente de votre virement.</p>`,
    `${ind}      </div>`,
    `${ind}    )}`,
    `${ind}    {paymentMethod === "transfer" && !user && (`,
    `${ind}      <div data-testid="transfer-auth-required" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-2.5 text-[12px] text-[#54434c] leading-5">`,
    `${ind}        Un compte Zenoria est nécessaire pour le virement. Il vous permet de retrouver les coordonnées bancaires, votre référence et le suivi de votre commande.`,
    `${ind}        <div className="mt-1.5 flex flex-wrap items-center gap-2">`,
    `${ind}          <button type="button" onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }} data-testid="transfer-auth-login" className="underline text-[#8f6075]">Me connecter</button>`,
    `${ind}          <span>·</span>`,
    `${ind}          <button type="button" onClick={() => { setAuthModalMode("signup"); setAuthModalOpen(true); }} data-testid="transfer-auth-signup" className="underline text-[#8f6075]">Créer mon compte</button>`,
    `${ind}          {paymentMethodsCfg.stripe_enabled && (`,
    `${ind}            <>`,
    `${ind}              <span>·</span>`,
    `${ind}              <button type="button" onClick={() => setPaymentMethod("card")} data-testid="transfer-auth-back-card" className="underline text-[#8f6075]">Choisir la carte</button>`,
    `${ind}            </>`,
    `${ind}          )}`,
    `${ind}        </div>`,
    `${ind}      </div>`,
    `${ind}    )}`,
    `${ind}  </div>`,
    `${ind})}`,
    `${ind}{paymentMethodsLoaded && !paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled && (`,
    `${ind}  <div data-testid="no-payment-method-available" className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[12px] text-amber-900 leading-5">`,
    `${ind}    Aucun moyen de paiement n&apos;est disponible actuellement. Merci de réessayer plus tard ou de nous contacter.`,
    `${ind}  </div>`,
    `${ind})}`,
  ];
  lines = [...lines.slice(0, s), ...block, ...lines.slice(e + 1)];
  console.log(`OK repere : bloc de choix remplace (${e - s + 1} lignes -> ${block.length} lignes)`);
}

// D — la ligne "Deja cliente ? (facultatif)" ne concerne que la carte
{
  const idxs = [];
  lines.forEach((l, i) => {
    if (l.trim() === "{!user && (" && lines.slice(i, i + 3).some((x) => x.includes("account-choice-line"))) idxs.push(i);
  });
  if (idxs.length !== 1) fail(`ligne "Deja cliente ?" : attendu 1 ancre, trouve ${idxs.length}.`);
  lines[idxs[0]] = lines[idxs[0]].replace(
    "{!user && (",
    '{paymentMethodsLoaded && paymentMethodsCfg.stripe_enabled && paymentMethod === "card" && !user && ('
  );
  console.log('OK repere : ligne "Deja cliente ?" reservee a la carte');
}

let text = lines.join(EOL);

// E — "Paiement securise via Stripe." : carte active ET choisie
{
  const from = 'paymentMethod === "card" ? <p className="text-[11px] text-center text-[#7e7378]">Paiement sécurisé via Stripe.</p> : null';
  if (count(text, from) !== 1) fail('ligne Stripe : forme attendue (apres fix-stripe-ternaire) introuvable ou en double.');
  text = text.replace(from, from.replace('paymentMethod === "card" ?', 'paymentMethod === "card" && paymentMethodsCfg.stripe_enabled ?'));
  console.log("OK repere : ligne Stripe conditionnee a la carte active");
}

// Garde-fous finaux
const exactlyOne = ['data-testid="payment-method-choice"', 'data-testid="payment-method-card"', 'data-testid="payment-method-transfer"',
  'data-testid="transfer-only-notice"', 'data-testid="no-payment-method-available"', 'data-testid="transfer-auth-required"',
  'data-testid="cgv-checkbox"', 'data-testid="checkout-button"', "Paiement sécurisé via Stripe"];
for (const n of exactlyOne) if (count(text, n) !== 1) fail(`garde-fou final : ${JSON.stringify(n)} doit apparaitre exactement une fois (trouve ${count(text, n)}).`);
for (const n of ["sous 3 jours", "disabled={!paymentMethodsCfg.stripe_enabled}", "disabled={!paymentMethodsCfg.transfer_enabled}"])
  if (count(text, n) !== 0) fail(`garde-fou final : ${JSON.stringify(n)} ne devrait plus exister.`);
if (count(text, "paymentMethodsLoaded") < 4 || count(text, "setPaymentMethodsLoaded(true)") !== 1) fail("garde-fou final : indicateur paymentMethodsLoaded incomplet.");
if (text === original) fail("aucune modification produite.");
console.log("OK garde-fou : blocs uniques, delai en dur supprime, cgv/commander intacts");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else { fs.writeFileSync(file, text, "utf8"); console.log("Fichier modifie : pages\\index.js"); }
