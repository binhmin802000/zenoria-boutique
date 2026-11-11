// ============================================================
// PATCH LOT 1a — PASTILLE ROUGE DE NOUVEAUTES DANS « MON COMPTE » — ZENORIA_ACCOUNT_NEWS_V1
//
// Modifie : pages/compte.js, components/SiteHeader.js
// Prerequis (fichiers a copier AVANT, ce script ne les cree pas) :
//   lib/accountNews.js, lib/useAccountNews.js
// Prerequis base : fonction SQL customer_account_news() creee (sql/supabase_lot1a_customer_account_news.sql).
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois dans le fichier, sinon le script
// s arrete sans rien ecrire. Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-lot1a-pastille-compte.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MARKER = "ZENORIA_ACCOUNT_NEWS_V1";
const TAG = "[patch-lot1a-pastille-compte]";

const COMPTE = "pages/compte.js";
const HEADER = "components/SiteHeader.js";
const REQUIRED_NEW_FILES = ["lib/accountNews.js", "lib/useAccountNews.js"];

const BADGE_CLASS = "pointer-events-none absolute left-0 top-0 h-[18px] min-w-[18px] px-1 rounded-full bg-[#c0392b] text-white text-[10px] font-medium leading-none grid place-items-center";
const BURGER_BADGE_CLASS = "pointer-events-none absolute right-0 top-0 sm:hidden h-[18px] min-w-[18px] px-1 rounded-full bg-[#c0392b] text-white text-[10px] font-medium leading-none grid place-items-center";
const INLINE_BADGE_CLASS = "ml-1 inline-grid h-[18px] min-w-[18px] px-1 rounded-full bg-[#c0392b] text-white text-[10px] font-medium leading-none place-items-center align-middle";
const TAB_BADGE_CLASS = "inline-grid h-[18px] min-w-[18px] px-1 rounded-full bg-[#c0392b] text-white text-[10px] font-medium leading-none place-items-center";

const compteEdits = [
  {
    name: "import du hook",
    find: 'import { resolveFxSeason } from "@/lib/seasons"; // ZENORIA_COMPTE_SEASON_FX_V1',
    replace: [
      'import { resolveFxSeason } from "@/lib/seasons"; // ZENORIA_COMPTE_SEASON_FX_V1',
      'import { useAccountNews } from "@/lib/useAccountNews"; // ZENORIA_ACCOUNT_NEWS_V1',
    ].join("\n"),
  },
  {
    name: "etats des nouveautes",
    find: "const [ordersVersion, setOrdersVersion] = useState(0);",
    replace: [
      "const [ordersVersion, setOrdersVersion] = useState(0);",
      "  // ZENORIA_ACCOUNT_NEWS_V1 : donnees des nouveautes (null = lecture non reussie)",
      "  const [newsRows, setNewsRows] = useState(null);",
      "  const [newsReviews, setNewsReviews] = useState(null);",
      "  const [newsReady, setNewsReady] = useState(false);",
    ].join("\n"),
  },
  {
    name: "aucune commande : point de depart vide",
    find: "        setOrders([]);\n        setOrdersLoading(false);\n        return;",
    replace: [
      "        setOrders([]);",
      "        // ZENORIA_ACCOUNT_NEWS_V1 : aucune commande -> point de depart vide (sauf si la lecture des commandes a echoue)",
      "        if (ordersRes && !ordersRes.error) { setNewsRows([]); setNewsReviews([]); }",
      "        setNewsReady(true);",
      "        setOrdersLoading(false);",
      "        return;",
    ].join("\n"),
  },
  {
    name: "Promise.all : troisieme lecture",
    find: "const [itemsRes, historyRes] = await Promise.all([",
    replace: "const [itemsRes, historyRes, newsReviewsRes] = await Promise.all([",
  },
  {
    name: "lecture de l historique par la fonction SQL + lecture legere des avis",
    find: 'supabase.from("order_status_history").select("order_id, status, changed_at").in("order_id", ids).in("status", ["paid", "shipped", "delivered"]),',
    replace: [
      'supabase.rpc("customer_account_news"), // ZENORIA_ACCOUNT_NEWS_V1 : fonction SQL (une cliente ne lit pas order_status_history en direct : la RLS est reservee a l administration)',
      '        supabase.from("reviews").select("id, status, reply, reply_at").in("order_id", ids), // ZENORIA_ACCOUNT_NEWS_V1 : lecture legere pour la pastille de Mes avis',
    ].join("\n"),
  },
  {
    name: "donnees des nouveautes apres lecture",
    find: "const history = (historyRes && !historyRes.error && historyRes.data) || [];",
    replace: [
      "const history = (historyRes && !historyRes.error && historyRes.data) || [];",
      "      // ZENORIA_ACCOUNT_NEWS_V1 : null si la lecture a echoue (le point de depart n est alors pas pose)",
      "      setNewsRows(historyRes && !historyRes.error && Array.isArray(historyRes.data) ? historyRes.data : null);",
      "      setNewsReviews(newsReviewsRes && !newsReviewsRes.error && Array.isArray(newsReviewsRes.data) ? newsReviewsRes.data : null);",
      "      setNewsReady(true);",
    ].join("\n"),
  },
  {
    name: "etapes du suivi : on ignore les annulations",
    find: "history.filter((h) => h.order_id === o.id).forEach((h) => { steps[h.status] = h.changed_at; });",
    replace: 'history.filter((h) => h.order_id === o.id && h.status !== "cancelled").forEach((h) => { steps[h.status] = h.changed_at; }); // ZENORIA_ACCOUNT_NEWS_V1 : la fonction renvoie aussi les annulations (comptees dans la pastille, pas dans le suivi)',
  },
  {
    name: "appel du hook",
    find: "const reviewableCount = reviewItems.filter((r) => r.can_review).length;",
    replace: [
      "const reviewableCount = reviewItems.filter((r) => r.can_review).length;",
      "  // ZENORIA_ACCOUNT_NEWS_V1 : pastille rouge de nouveautes (memoire dans le navigateur, par compte)",
      "  const accountNews = useAccountNews({",
      "    userId: user ? user.id : null,",
      "    ready: newsReady,",
      "    orders,",
      "    rows: newsRows,",
      "    reviews: newsReviews,",
      "    reviewsEnabled: showReviews,",
      "    section,",
      "  });",
    ].join("\n"),
  },
  {
    name: "pastille dans l en-tete",
    find: 'onFavClick={() => go("favoris")}',
    replace: [
      'onFavClick={() => go("favoris")}',
      "        accountBadge={accountNews.total} // ZENORIA_ACCOUNT_NEWS_V1",
    ].join("\n"),
  },
  {
    name: "pastille sur les onglets",
    find: '<Icon size={16} className="text-[#8f6075]" /> {s.label}',
    replace: [
      '<Icon size={16} className="text-[#8f6075]" /> {s.label}',
      "                      {accountNews.tabLabels[s.id] ? (",
      "                        <span data-testid={`account-nav-badge-${s.id}`} className=\"" + TAB_BADGE_CLASS + "\">",
      "                          {accountNews.tabLabels[s.id]}",
      '                          <span className="sr-only"> nouveautés</span>',
      "                        </span>",
      "                      ) : null}",
    ].join("\n"),
  },
];

const headerEdits = [
  {
    name: "prop accountBadge",
    find: "  showFavorites = true,\n  menuOpen,",
    replace: "  showFavorites = true,\n  accountBadge = 0, // ZENORIA_ACCOUNT_NEWS_V1 : nombre de nouveautes non vues (pastille rouge), 0 = aucune\n  menuOpen,",
  },
  {
    name: "calcul du libelle",
    find: "const items = NAV.filter((n) => !n.seasonsOnly || showSeasons);",
    replace: [
      "const items = NAV.filter((n) => !n.seasonsOnly || showSeasons);",
      "  // ZENORIA_ACCOUNT_NEWS_V1 : pastille rouge sur le compte (plafonnee a 9+)",
      "  const newsCount = Math.max(0, Math.floor(Number(accountBadge) || 0));",
      '  const newsLabel = newsCount > 9 ? "9+" : String(newsCount);',
    ].join("\n"),
  },
  {
    name: "pastille sur l icone compte",
    find: "<User size={19} />\n            </Button>",
    replace: [
      "<User size={19} />",
      "            </Button>",
      "            {newsCount > 0 && (",
      '              <span data-testid="header-account-badge" className="' + BADGE_CLASS + '">',
      "                {newsLabel}",
      '                <span className="sr-only"> nouveautés dans votre compte</span>',
      "              </span>",
      "            )}",
    ].join("\n"),
  },
  {
    name: "pastille dans le menu compte",
    find: "<User size={16} /> Mon compte",
    replace: [
      "<User size={16} /> Mon compte",
      "                  {newsCount > 0 && (",
      '                    <span data-testid="menu-account-badge" className="' + INLINE_BADGE_CLASS + '">',
      "                      {newsLabel}",
      '                      <span className="sr-only"> nouveautés</span>',
      "                    </span>",
      "                  )}",
    ].join("\n"),
  },
  {
    name: "bouton burger",
    find: '<Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleMenu}>\n            {isOpen ? <X /> : <Menu />}',
    replace: [
      '<Button variant="ghost" size="icon" className="lg:hidden relative" onClick={toggleMenu}>',
      "            {isOpen ? <X /> : <Menu />}",
      "            {showAccount && newsCount > 0 && (",
      '              <span data-testid="header-burger-badge" className="' + BURGER_BADGE_CLASS + '">',
      "                {newsLabel}",
      '                <span className="sr-only"> nouveautés dans votre compte</span>',
      "              </span>",
      "            )}",
    ].join("\n"),
  },
  {
    name: "ligne Mon compte du menu mobile",
    find: '<a href="/compte" className="text-left text-[#8f6075]">\n                  Mon compte\n                </a>',
    replace: [
      '<a href="/compte" className="text-left text-[#8f6075]">',
      "                  Mon compte",
      "                  {newsCount > 0 && (",
      '                    <span data-testid="mobile-account-badge" className="' + INLINE_BADGE_CLASS + '">',
      "                      {newsLabel}",
      '                      <span className="sr-only"> nouveautés</span>',
      "                    </span>",
      "                  )}",
      "                </a>",
    ].join("\n"),
  },
];

function countOccurrences(text, needle) {
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

function prepare(rel, edits, problems) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    problems.push(rel + " : fichier introuvable (lancer le script depuis le dossier du projet)");
    return null;
  }
  const raw = fs.readFileSync(full, "utf8");
  const crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(rel + " : deja patche (" + MARKER + " present), rien a faire");
    return null;
  }
  let ok = true;
  for (const e of edits) {
    const n = countOccurrences(text, e.find);
    if (n !== 1) {
      problems.push(rel + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)");
      ok = false;
    }
  }
  if (!ok) return null;
  for (const e of edits) text = text.replace(e.find, () => e.replace);
  return { full, out: crlf ? text.replace(/\n/g, "\r\n") : text, crlf };
}

const problems = [];
for (const rel of REQUIRED_NEW_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) problems.push(rel + " : fichier a copier avant de lancer ce script");
}
const compte = prepare(COMPTE, compteEdits, problems);
const header = prepare(HEADER, headerEdits, problems);

if (problems.length > 0 || !compte || !header) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

fs.writeFileSync(compte.full, compte.out, "utf8");
fs.writeFileSync(header.full, header.out, "utf8");
console.log(TAG + " 2 fichiers mis a jour : " + COMPTE + " (" + (compte.crlf ? "CRLF" : "LF") + "), " + HEADER + " (" + (header.crlf ? "CRLF" : "LF") + ")");
