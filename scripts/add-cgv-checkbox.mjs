// scripts/add-cgv-checkbox.mjs
//
// Chantier mentions legales/CGV, integration technique :
//   1. Cree pages/mentions-legales.js (meme style que pages/confidentialite.js :
//      composants Todo et Section), avec le contenu des mentions legales et
//      des CGV, y compris le formulaire type de retractation.
//   2. Modifie pages/index.js :
//      - ajoute l'etat cgvAccepted
//      - ajoute une garde dans handleCheckout (filet de securite, en plus du
//        bouton desactive)
//      - ajoute une case a cocher juste avant le bouton "Commander", avec un
//        lien vers /mentions-legales
//      - le bouton "Commander" reste desactive tant que la case n'est pas
//        cochee (en plus de shopPaused et checkoutLoading)
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne de pages/index.js ; peut etre relance sans
// effet (idempotent).
//
// Usage : node scripts/add-cgv-checkbox.mjs

import fs from "node:fs";
import path from "node:path";

const indexPath = path.join("pages", "index.js");
const mentionsPath = path.join("pages", "mentions-legales.js");

if (!fs.existsSync(indexPath)) {
  console.error(`✗ Fichier introuvable : ${indexPath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const MENTIONS_LEGALES_CONTENT = [
  "// ZENORIA_MENTIONS_LEGALES_V1",
  "import React from \"react\";",
  "import Head from \"next/head\";",
  "",
  "// ============================================================",
  "// PAGE \u00ab MENTIONS L\u00c9GALES & CGV \u00bb \u2014 /mentions-legales",
  "//",
  "// VERSION PROVISOIRE : les passages \u00ab \u00c0 COMPL\u00c9TER \u00bb doivent \u00eatre renseign\u00e9s, et l'ensemble relu",
  "// (id\u00e9alement par un juriste) avant l'ouverture r\u00e9elle de la boutique. R\u00e9dig\u00e9 sur le m\u00eame mod\u00e8le",
  "// que pages/confidentialite.js (composants Todo et Section), \u00e0 tenir \u00e0 jour en parall\u00e8le.",
  "// ============================================================",
  "",
  "const Todo = ({ children }) => (",
  "  <mark className=\"bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[0.92em]\">[\u00c0 COMPL\u00c9TER : {children}]</mark>",
  ");",
  "",
  "const Section = ({ id, title, children }) => (",
  "  <section id={id} className=\"mt-9\">",
  "    <h2 className=\"font-serif text-2xl mb-3 text-[#412f3b]\">{title}</h2>",
  "    <div className=\"space-y-3 text-[15px] leading-7 text-[#54434c]\">{children}</div>",
  "  </section>",
  ");",
  "",
  "export default function MentionsLegales() {",
  "  return (",
  "    <div className=\"min-h-screen bg-[#fbf8f4] text-[#342b32]\">",
  "      <Head>",
  "        <title>Mentions l\u00e9gales &amp; CGV \u2013 Zenoria</title>",
  "        <meta name=\"robots\" content=\"noindex\" />",
  "      </Head>",
  "",
  "      <header className=\"border-b border-[#eadfe4] bg-[#fbf8f4]/95\">",
  "        <div className=\"max-w-3xl mx-auto px-6 h-16 flex items-center justify-between\">",
  "          <a href=\"/\" className=\"font-serif text-xl tracking-[.22em] text-[#412f3b]\">ZENORIA</a>",
  "          <a href=\"/\" className=\"text-sm text-[#8f6075] underline\">Retour \u00e0 la boutique</a>",
  "        </div>",
  "      </header>",
  "",
  "      <main className=\"max-w-3xl mx-auto px-6 py-12\">",
  "        <h1 className=\"font-serif text-4xl text-[#412f3b]\">Mentions l\u00e9gales &amp; Conditions g\u00e9n\u00e9rales de vente</h1>",
  "        <p className=\"text-sm text-[#8b737e] mt-2\">Derni\u00e8re mise \u00e0 jour : 16 octobre 2026</p>",
  "",
  "        <div data-testid=\"draft-notice\" className=\"mt-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[13px] leading-5 px-4 py-3\">",
  "          Version provisoire : les passages surlign\u00e9s doivent \u00eatre compl\u00e9t\u00e9s et le texte relu avant l&apos;ouverture de la boutique.",
  "        </div>",
  "",
  "        <Section id=\"editeur\" title=\"Qui \u00e9dite ce site ?\">",
  "          <p>",
  "            Le site Zenoria est \u00e9dit\u00e9 par <Todo>nom et pr\u00e9nom, micro-entrepreneur (entreprise individuelle), adresse du si\u00e8ge de l&apos;activit\u00e9</Todo>, immatricul\u00e9 sous le num\u00e9ro SIRET <Todo>num\u00e9ro SIRET</Todo>.",
  "          </p>",
  "          <p>",
  "            Contact : <Todo>adresse e-mail professionnelle</Todo> \u2014 <Todo>num\u00e9ro de t\u00e9l\u00e9phone non surtax\u00e9</Todo>.",
  "          </p>",
  "          <p>",
  "            TVA non applicable, article 293 B du Code g\u00e9n\u00e9ral des imp\u00f4ts <Todo>\u00e0 confirmer selon le r\u00e9gime fiscal r\u00e9ellement choisi</Todo>.",
  "          </p>",
  "          <p>",
  "            Directeur de la publication : <Todo>nom et pr\u00e9nom</Todo>.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"hebergement\" title=\"H\u00e9bergement\">",
  "          <ul className=\"list-disc pl-5 space-y-2\">",
  "            <li><strong>Vercel Inc.</strong>, 340 S Lemon Ave #4133, Walnut, CA 91789, \u00c9tats-Unis \u2014 h\u00e9bergement du site.</li>",
  "            <li><strong>Supabase Inc.</strong> \u2014 h\u00e9bergement de la base de donn\u00e9es, de l&apos;authentification et des fichiers.</li>",
  "          </ul>",
  "        </Section>",
  "",
  "        <Section id=\"propriete\" title=\"Propri\u00e9t\u00e9 intellectuelle\">",
  "          <p>",
  "            L&apos;ensemble des \u00e9l\u00e9ments pr\u00e9sents sur le site (textes, photographies, vid\u00e9os, logos, charte graphique, nom \u00ab Zenoria \u00bb) est prot\u00e9g\u00e9 par le droit de la propri\u00e9t\u00e9 intellectuelle. Toute reproduction non autoris\u00e9e est interdite.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"produits\" title=\"Les produits\">",
  "          <p>",
  "            Les bagues propos\u00e9es sont fa\u00e7onn\u00e9es \u00e0 la main en cristaux Swarovski, r\u00e9parties en collections saisonni\u00e8res. En cas de rupture de stock, le produit reste commandable avec un d\u00e9lai de fabrication compl\u00e9mentaire affich\u00e9 sur la fiche produit.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"prix-commande\" title=\"Prix et commande\">",
  "          <p>",
  "            Les prix sont indiqu\u00e9s en euros, toutes taxes comprises. Les frais de livraison sont indiqu\u00e9s avant la validation d\u00e9finitive de la commande. La commande n&apos;est d\u00e9finitive qu&apos;apr\u00e8s confirmation du paiement.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"paiement\" title=\"Paiement\">",
  "          <p>",
  "            Le paiement s&apos;effectue en ligne, par carte bancaire, via la plateforme s\u00e9curis\u00e9e Stripe. Vos coordonn\u00e9es bancaires ne sont \u00e0 aucun moment transmises ou conserv\u00e9es par Zenoria : elles sont trait\u00e9es directement par Stripe, certifi\u00e9 PCI-DSS.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"livraison\" title=\"Livraison\">",
  "          <p>",
  "            Les produits sont livr\u00e9s \u00e0 l&apos;adresse indiqu\u00e9e lors de la commande, en France m\u00e9tropolitaine. Les d\u00e9lais de livraison incluent, le cas \u00e9ch\u00e9ant, le d\u00e9lai de fabrication artisanale compl\u00e9mentaire, clairement indiqu\u00e9 avant la validation de la commande.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"retractation\" title=\"Droit de r\u00e9tractation\">",
  "          <p>",
  "            Conform\u00e9ment aux articles L. 221-18 et suivants du Code de la consommation, vous disposez d&apos;un d\u00e9lai de 14 jours calendaires \u00e0 compter de la r\u00e9ception du bien pour exercer votre droit de r\u00e9tractation, sans avoir \u00e0 justifier de motif ni \u00e0 payer de p\u00e9nalit\u00e9, \u00e0 l&apos;exception des frais de retour qui restent \u00e0 votre charge.",
  "          </p>",
  "          <p>",
  "            Pour exercer ce droit, notifiez votre d\u00e9cision avant l&apos;expiration du d\u00e9lai (e-mail, courrier, ou le formulaire ci-dessous). Le remboursement intervient dans un d\u00e9lai maximal de 14 jours suivant la r\u00e9ception du bien retourn\u00e9.",
  "          </p>",
  "          <p className=\"text-[13px] text-[#8b737e] italic\">",
  "            Si une bague est r\u00e9alis\u00e9e sur mesure selon vos sp\u00e9cifications propres, l&apos;article L. 221-28 du Code de la consommation peut exclure le droit de r\u00e9tractation pour cet article \u2014 <Todo>pr\u00e9ciser si ce cas s&apos;applique \u00e0 votre catalogue</Todo>.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"garanties\" title=\"Garanties l\u00e9gales\">",
  "          <p>",
  "            Tous les produits b\u00e9n\u00e9ficient de la garantie l\u00e9gale de conformit\u00e9 (articles L. 217-3 et suivants du Code de la consommation) et de la garantie l\u00e9gale contre les vices cach\u00e9s (articles 1641 et suivants du Code civil).",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"mediation\" title=\"M\u00e9diation de la consommation\">",
  "          <p>",
  "            Conform\u00e9ment \u00e0 l&apos;article L. 616-1 du Code de la consommation, en cas de litige non r\u00e9solu directement avec le service client, vous pouvez recourir gratuitement \u00e0 un m\u00e9diateur de la consommation : <Todo>nom et coordonn\u00e9es du m\u00e9diateur choisi et adh\u00e9r\u00e9</Todo>.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"droit-applicable\" title=\"Droit applicable\">",
  "          <p>",
  "            Les pr\u00e9sentes conditions sont soumises au droit fran\u00e7ais. En cas de litige non r\u00e9solu \u00e0 l&apos;amiable ou par m\u00e9diation, les tribunaux fran\u00e7ais comp\u00e9tents seront saisis selon les r\u00e8gles de droit commun applicables en mati\u00e8re de consommation.",
  "          </p>",
  "        </Section>",
  "",
  "        <Section id=\"formulaire-retractation\" title=\"Formulaire type de r\u00e9tractation\">",
  "          <div className=\"rounded-xl bg-white border border-[#eadfe4] px-5 py-4 text-[14px] leading-6\">",
  "            <p className=\"mb-2\">(Compl\u00e9tez et envoyez ce formulaire uniquement si vous souhaitez vous r\u00e9tracter.)</p>",
  "            <p>\u00c0 l&apos;attention de <Todo>nom et adresse e-mail de contact</Todo> :</p>",
  "            <p>Je notifie par la pr\u00e9sente ma r\u00e9tractation du contrat portant sur la vente du bien ci-dessous :</p>",
  "            <p>Command\u00e9 le / re\u00e7u le : ..................................................................</p>",
  "            <p>Num\u00e9ro de commande : ..................................................................</p>",
  "            <p>Nom du consommateur : ..................................................................</p>",
  "            <p>Adresse du consommateur : ..................................................................</p>",
  "            <p>Date : ..................................................................</p>",
  "          </div>",
  "        </Section>",
  "      </main>",
  "    </div>",
  "  );",
  "}",
].join("\r\n") + "\r\n";

const raw = fs.readFileSync(indexPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

// ---------------------------------------------------------------------
// Idempotence globale
// ---------------------------------------------------------------------
const mentionsMarker = "// ZENORIA_MENTIONS_LEGALES_V1";
const mentionsExists = fs.existsSync(mentionsPath);
const mentionsAlreadyDone = mentionsExists && fs.readFileSync(mentionsPath, "utf8").includes(mentionsMarker);
const indexAlreadyDone = raw.includes("cgvAccepted");

if (mentionsAlreadyDone && indexAlreadyDone) {
  console.log("✓ Rien à modifier : la case CGV et la page mentions légales sont déjà en place.");
  process.exit(0);
}

if (mentionsExists && !mentionsAlreadyDone) {
  console.error(`✗ ${mentionsPath} existe déjà avec un contenu différent — rien n'a été écrit.`);
  console.error("Supprimez-le ou renommez-le si vous voulez le remplacer, puis relancez ce script.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Repères dans pages/index.js (chacun doit apparaître EXACTEMENT une fois)
// ---------------------------------------------------------------------
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {
  checkoutErrorState: '  const [checkoutError, setCheckoutError] = useState("");',
  handleCheckoutStart:
    "  const handleCheckout = async () => {" + eol +
    "    setCheckoutNotice(false);" + eol +
    '    setCheckoutError("");' + eol +
    "    setCheckoutLoading(true);",
  totalsAndButton:
    '                      <div className={`flex justify-between font-serif text-[#342b32] border-t border-[#eadfe4] ${tightFooter ? "text-lg pt-1.5" : "text-xl pt-2"}`}>' + eol +
    "                        <span>Total TTC</span>" + eol +
    "                        <span>{formatPrice(totals.total)}</span>" + eol +
    "                      </div>" + eol +
    "                    </div>" + eol +
    eol +
    "                    <button" + eol +
    "                      onClick={handleCheckout}" + eol +
    "                      disabled={shopPaused || checkoutLoading}" + eol +
    '                      data-testid="checkout-button"' + eol +
    '                      className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c] ${tightFooter ? "h-11" : "h-12"}`}' + eol +
    "                    >" + eol +
    '                      {shopPaused ? "Commandes temporairement fermées" : checkoutLoading ? "Redirection vers le paiement..." : "Commander"}' + eol +
    "                    </button>",
};

const missing = [];
for (const [key, needle] of Object.entries(anchors)) {
  const count = countOccurrences(raw, needle);
  if (count !== 1) {
    missing.push({ key, count });
  }
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • repère « ${m.key} » (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Construction des remplacements
// ---------------------------------------------------------------------
let out = raw;

// 1) état cgvAccepted, juste après checkoutError
out = out.replace(
  anchors.checkoutErrorState,
  anchors.checkoutErrorState + eol + '  const [cgvAccepted, setCgvAccepted] = useState(false);'
);

// 2) garde de sécurité dans handleCheckout
out = out.replace(
  anchors.handleCheckoutStart,
  "  const handleCheckout = async () => {" + eol +
    "    setCheckoutNotice(false);" + eol +
    '    setCheckoutError("");' + eol +
    "    if (!cgvAccepted) {" + eol +
    '      setCheckoutError("Merci d\'accepter les conditions générales de vente avant de valider votre commande.");' + eol +
    "      return;" + eol +
    "    }" + eol +
    "    setCheckoutLoading(true);"
);

// 3) case à cocher + bouton (disabled complété)
out = out.replace(
  anchors.totalsAndButton,
  '                      <div className={`flex justify-between font-serif text-[#342b32] border-t border-[#eadfe4] ${tightFooter ? "text-lg pt-1.5" : "text-xl pt-2"}`}>' + eol +
    "                        <span>Total TTC</span>" + eol +
    "                        <span>{formatPrice(totals.total)}</span>" + eol +
    "                      </div>" + eol +
    "                    </div>" + eol +
    eol +
    '                    <label className="flex items-start gap-2 text-[12px] text-[#54434c] leading-5">' + eol +
    "                      <input" + eol +
    '                        type="checkbox"' + eol +
    "                        checked={cgvAccepted}" + eol +
    "                        onChange={(e) => { setCgvAccepted(e.target.checked); setCheckoutError(\"\"); }}" + eol +
    '                        data-testid="cgv-checkbox"' + eol +
    '                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#8f6075]"' + eol +
    "                      />" + eol +
    "                      <span>" + eol +
    "                        J&apos;ai lu et j&apos;accepte les{\" \"}" + eol +
    '                        <a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">' + eol +
    "                          conditions générales de vente et les mentions légales" + eol +
    "                        </a>" + eol +
    "                      </span>" + eol +
    "                    </label>" + eol +
    eol +
    "                    <button" + eol +
    "                      onClick={handleCheckout}" + eol +
    "                      disabled={shopPaused || checkoutLoading || !cgvAccepted}" + eol +
    '                      data-testid="checkout-button"' + eol +
    '                      className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c] ${tightFooter ? "h-11" : "h-12"}`}' + eol +
    "                    >" + eol +
    '                      {shopPaused ? "Commandes temporairement fermées" : checkoutLoading ? "Redirection vers le paiement..." : "Commander"}' + eol +
    "                    </button>"
);

// ---------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------
if (!indexAlreadyDone) {
  fs.writeFileSync(indexPath, out, "utf8");
  console.log(`✓ ${indexPath} : 3 modification(s)`);
  console.log("  • état cgvAccepted ajouté");
  console.log("  • garde de sécurité dans handleCheckout (refuse si CGV non acceptées)");
  console.log("  • case à cocher ajoutée avant le bouton « Commander », bouton désactivé tant qu'elle n'est pas cochée");
} else {
  console.log(`= ${indexPath} : déjà en place, inchangé.`);
}

if (!mentionsAlreadyDone) {
  fs.writeFileSync(mentionsPath, MENTIONS_LEGALES_CONTENT, "utf8");
  console.log(`✓ ${mentionsPath} : créé.`);
}

console.log("\nTerminé.");
