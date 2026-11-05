#!/usr/bin/env node
// ============================================================
// patch-lotH1-site-header.mjs  -  ZENORIA_SITE_HEADER_V1
//
// Lot H1 : extrait l'en-tete de l'accueil (pages/index.js, balise <header> ... </header>)
// dans un composant partage components/SiteHeader.js, utilise pour l'instant par l'accueil seul.
// Rendu identique a l'actuel : memes classes, memes comportements, memes data-testid.
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotH1-site-header.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotH1-site-header.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const INDEX = path.join(ROOT, "pages", "index.js");
const HEADER = path.join(ROOT, "components", "SiteHeader.js");
const MARK = "ZENORIA_SITE_HEADER_V1";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

// ---------- Composant partage ----------
const SITE_HEADER = `import React from "react";
import { Search, User, Heart, ShoppingBag, Menu, X, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import CrystalLogo from "@/components/CrystalLogo";

// ============================================================
// EN-TETE PARTAGE DU SITE - ${"ZENORIA_SITE_HEADER_V1"}
//
// Repris a l'identique de la page d'accueil (pages/index.js) : memes classes, memes comportements.
// Le composant ne contient aucune logique metier : la page lui transmet ses etats et ses actions.
//
// Menu : si onSection / onStory sont fournis (accueil), les entrees sont des boutons qui font defiler
// ou deplier la section. Sinon (autres pages, lots suivants), ce sont des liens vers l'accueil (/#...).
// current : cle de l'entree de la page courante ("quiz"), soulignee. Aucune sur l'accueil.
// ============================================================

const NAV = [
  { key: "collections", label: "Bijoux", section: "collections", anchor: "collections" },
  { key: "seasons", label: "Les saisons", section: "seasons", anchor: "seasons", seasonsOnly: true },
  { key: "savoir-faire", label: "Savoir-faire", section: "savoir-faire", anchor: "savoir-faire" },
  { key: "histoire", label: "Notre histoire", story: true, anchor: "notre-histoire", testId: "nav-histoire", testIdMobile: "nav-histoire-mobile" },
  { key: "philosophie", label: "Notre philosophie", section: "philosophie", anchor: "philosophie" },
  { key: "quiz", label: "Quiz", href: "/quiz", testId: "nav-quiz", testIdMobile: "nav-quiz-mobile" },
  { key: "contact", label: "Contact", section: "contact", anchor: "contact" },
];

function NavItem({ item, mobile, current, onSection, onStory, onMenuClose }) {
  const isCurrent = current === item.key;
  let cls = mobile ? "text-left" : "hover:text-[#8f6075]";
  if (isCurrent) cls += mobile ? " text-[#8f6075] font-medium" : " text-[#8f6075] font-medium border-b border-[#8f6075]";
  const testId = mobile ? item.testIdMobile : item.testId;
  const ariaCurrent = isCurrent ? "page" : undefined;
  const after = () => {
    if (mobile && onMenuClose) onMenuClose();
  };
  if (item.href) {
    return (
      <a href={item.href} data-testid={testId} aria-current={ariaCurrent} onClick={after} className={cls}>
        {item.label}
      </a>
    );
  }
  let handler = null;
  if (item.story) {
    if (onStory) handler = () => onStory();
  } else if (onSection) {
    handler = () => onSection(item.section);
  }
  if (handler) {
    return (
      <button
        type="button"
        data-testid={testId}
        aria-current={ariaCurrent}
        onClick={() => {
          handler();
          after();
        }}
        className={cls}
      >
        {item.label}
      </button>
    );
  }
  return (
    <a href={"/#" + item.anchor} data-testid={testId} aria-current={ariaCurrent} onClick={after} className={cls}>
      {item.label}
    </a>
  );
}

export default function SiteHeader({
  current = null,
  onSection,
  onStory,
  showSeasons = true,
  showSearch = true,
  menuOpen = false,
  onMenuToggle,
  onMenuClose,
  user = null,
  isAdmin = false,
  authLoading = false,
  accountMenuOpen = false,
  onAccountClick,
  onLogin,
  onLogout,
  favCount = 0,
  onFavClick,
  cartCount = 0,
  onCartClick,
  logoMode = 1,
  logoHref = null,
}) {
  const items = NAV.filter((n) => !n.seasonsOnly || showSeasons);
  const closeMenu = () => {
    if (onMenuClose) onMenuClose();
  };
  const logo = <CrystalLogo compact mode={logoMode} />;
  return (
    <header className="sticky top-0 z-40 bg-[#fbf8f4]/95 backdrop-blur border-b border-[#eadfe4]">
      <div className="max-w-7xl mx-auto px-5 h-20 flex items-center justify-between">
        {logoHref ? (
          <a href={logoHref} aria-label="Zenoria, retour à l'accueil">
            {logo}
          </a>
        ) : (
          logo
        )}
        <nav className="hidden lg:flex gap-7 text-sm">
          {items.map((item) => (
            <NavItem key={item.key} item={item} current={current} onSection={onSection} onStory={onStory} />
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {showSearch && (
            <Button variant="ghost" size="icon">
              <Search size={19} />
            </Button>
          )}
          {/* Compte utilisateur */}
          <div className="relative hidden sm:block">
            <Button variant="ghost" size="icon" onClick={onAccountClick}>
              <User size={19} />
            </Button>
            {user && accountMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-[#eadfe4] p-4 z-50">
                <div className="text-xs text-[#9a7384] uppercase tracking-widest mb-1">Connecté(e) en tant que</div>
                <div className="text-sm font-medium truncate mb-3">{user.email}</div>
                {isAdmin && (
                  <a href="/admin" className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b] mb-2">
                    <Settings size={16} /> Administration
                  </a>
                )}
                <a href="/compte" data-testid="menu-account-link" className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b] mb-2">
                  <User size={16} /> Mon compte
                </a>
                <button onClick={onLogout} className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b]">
                  <LogOut size={16} /> Se déconnecter
                </button>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onFavClick} className="relative hidden sm:inline-flex" aria-label="Voir mes favoris">
            <Heart size={19} />
            {favCount > 0 && (
              <span className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
                {favCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={onCartClick} className="relative" aria-label="Ouvrir le panier" data-testid="header-cart">
            <ShoppingBag size={19} />
            {cartCount > 0 && (
              <span data-testid="header-cart-count" className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
                {cartCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuToggle}>
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {menuOpen && (
        <div className="lg:hidden px-6 pb-5 flex flex-col gap-3 text-sm">
          {items.map((item) => (
            <NavItem key={item.key} item={item} mobile current={current} onSection={onSection} onStory={onStory} onMenuClose={onMenuClose} />
          ))}
          <button
            onClick={() => {
              if (onFavClick) onFavClick();
              closeMenu();
            }}
            className="text-left"
          >
            Mes favoris{favCount > 0 ? " (" + favCount + ")" : ""}
          </button>
          {!authLoading &&
            (user ? (
              <>
                {isAdmin && (
                  <a href="/admin" className="text-left text-[#8f6075]">
                    Administration
                  </a>
                )}
                <a href="/compte" className="text-left text-[#8f6075]">
                  Mon compte
                </a>
                <button
                  onClick={() => {
                    if (onLogout) onLogout();
                    closeMenu();
                  }}
                  className="text-left text-[#8f6075]"
                >
                  Se déconnecter ({user.email})
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  if (onLogin) onLogin();
                  closeMenu();
                }}
                className="text-left text-[#8f6075]"
              >
                Connexion / Créer un compte
              </button>
            ))}
        </div>
      )}
    </header>
  );
}
`;

// ---------- Remplacement dans pages/index.js (6 espaces d'indentation, comme le header d'origine) ----------
const INDEX_JSX = `      <SiteHeader
        onSection={scrollToSection}
        onStory={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))}
        showSeasons={familiesReady}
        menuOpen={menu}
        onMenuToggle={() => setMenu(!menu)}
        onMenuClose={() => setMenu(false)}
        user={user}
        isAdmin={isAdmin}
        authLoading={authLoading}
        accountMenuOpen={accountMenuOpen}
        onAccountClick={() => {
          if (user) {
            setAccountMenuOpen(!accountMenuOpen);
          } else {
            setAuthModalOpen(true);
          }
        }}
        onLogin={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        favCount={favIds.length}
        onFavClick={() => setFavPanelOpen(true)}
        cartCount={cartCount}
        onCartClick={() => setCartOpen(true)}
        logoMode={logo}
      />`;

// ---------- Controles ----------
if (!fs.existsSync(INDEX)) stop("pages/index.js introuvable (lance le script depuis la racine du projet).");
if (fs.existsSync(HEADER)) stop("components/SiteHeader.js existe deja.");
let src = fs.readFileSync(INDEX, "utf8");
if (src.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans pages/index.js : lot deja applique.");

const eol = src.includes("\r\n") ? "\r\n" : "\n";
const OPEN = '<header className="sticky top-0 z-40 bg-[#fbf8f4]/95 backdrop-blur border-b border-[#eadfe4]">';
const CLOSE = "</header>";
const IMPORT_ANCHOR = 'import Footer from "@/components/Footer";';
const IMPORT_LINE = 'import SiteHeader from "@/components/SiteHeader"; // ' + MARK;

if (count(src, OPEN) !== 1) stop("la balise d'ouverture du header est trouvee " + count(src, OPEN) + " fois (attendu : 1).");
if (count(src, CLOSE) !== 1) stop("la balise </header> est trouvee " + count(src, CLOSE) + " fois (attendu : 1).");
if (count(src, IMPORT_ANCHOR) !== 1) stop("l'import de Footer est trouve " + count(src, IMPORT_ANCHOR) + " fois (attendu : 1).");

const openIdx = src.indexOf(OPEN);
const closeIdx = src.indexOf(CLOSE);
if (closeIdx < openIdx) stop("</header> precede la balise d'ouverture.");
const lineStart = src.lastIndexOf("\n", openIdx) + 1;
if (src.slice(lineStart, openIdx).trim() !== "") stop("du texte precede la balise header sur sa ligne.");
const end = closeIdx + CLOSE.length;
const block = src.slice(lineStart, end);
const blockLines = block.split(/\r?\n/).length;
if (blockLines !== 107) stop("le bloc header fait " + blockLines + " lignes (attendu : 107, lignes 979 a 1085). Le fichier a change depuis l'audit.");

const required = [
  'data-testid="nav-histoire"',
  'data-testid="nav-histoire-mobile"',
  'data-testid="nav-quiz"',
  'data-testid="menu-account-link"',
  "setFavPanelOpen(true)",
  "setCartOpen(true)",
  "handleLogout",
  "setAuthModalOpen(true)",
  "setMenu(!menu)",
  "familiesReady",
  'scrollToSection("philosophie")',
  "<CrystalLogo compact mode={logo} />",
];
for (const r of required) {
  if (!block.includes(r)) stop("le bloc header ne contient pas l'element attendu : " + r);
}
const outside = ["const scrollToSection =", "const handleLogout =", "const [menu, setMenu]", "const familiesReady", "const logo = 1", "OPEN_STORY_EVENT"];
for (const o of outside) {
  if (!src.includes(o)) stop("element attendu absent de pages/index.js : " + o);
}

// ---------- Application ----------
let next = src.slice(0, lineStart) + INDEX_JSX.replace(/\n/g, eol) + src.slice(end);
next = next.replace(IMPORT_ANCHOR, () => IMPORT_ANCHOR + eol + IMPORT_LINE);
if (next.includes(OPEN) || !next.includes("<SiteHeader") || !next.includes(IMPORT_LINE)) stop("controle final du remplacement en echec.");

console.log("Lot H1 - en-tete partage");
console.log(" - fin de ligne detectee : " + (eol === "\r\n" ? "CRLF" : "LF"));
console.log(" - pages/index.js : bloc header de " + blockLines + " lignes remplace par <SiteHeader ... /> (" + INDEX_JSX.split("\n").length + " lignes)");
console.log(" - pages/index.js : import SiteHeader ajoute apres l'import de Footer");
console.log(" - components/SiteHeader.js : nouveau fichier (" + SITE_HEADER.split("\n").length + " lignes)");

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(HEADER, SITE_HEADER, "utf8");
fs.writeFileSync(INDEX, next, "utf8");
console.log("\nOK : fichiers ecrits. Lance maintenant : npm run build");
