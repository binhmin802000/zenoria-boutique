import React, { useState } from "react"; // ZENORIA_SITE_HEADER_H2
import { Search, User, Heart, ShoppingBag, Menu, X, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import CrystalLogo from "@/components/CrystalLogo";

// ============================================================
// EN-TETE PARTAGE DU SITE - ZENORIA_SITE_HEADER_V1
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
  showAccount = true,
  showFavorites = true,
  menuOpen,
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
  // Menu mobile : pilote par la page quand elle fournit onMenuToggle (accueil), sinon gere par le composant (quiz, pages simples)
  const [innerMenu, setInnerMenu] = useState(false);
  const controlled = typeof onMenuToggle === "function";
  const isOpen = controlled ? Boolean(menuOpen) : innerMenu;
  const toggleMenu = controlled ? onMenuToggle : () => setInnerMenu((o) => !o);
  const closeMenu = () => {
    if (controlled) {
      if (onMenuClose) onMenuClose();
    } else {
      setInnerMenu(false);
    }
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
          {showAccount && (
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
          )}
          {showFavorites && (
          <Button variant="ghost" size="icon" onClick={onFavClick} className="relative hidden sm:inline-flex" aria-label="Voir mes favoris">
            <Heart size={19} />
            {favCount > 0 && (
              <span className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
                {favCount}
              </span>
            )}
          </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onCartClick} className="relative" aria-label="Ouvrir le panier" data-testid="header-cart">
            <ShoppingBag size={19} />
            {cartCount > 0 && (
              <span data-testid="header-cart-count" className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
                {cartCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleMenu}>
            {isOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {isOpen && (
        <div className="lg:hidden px-6 pb-5 flex flex-col gap-3 text-sm">
          {items.map((item) => (
            <NavItem key={item.key} item={item} mobile current={current} onSection={onSection} onStory={onStory} onMenuClose={closeMenu} />
          ))}
          {showFavorites && (
            <button
              onClick={() => {
                if (onFavClick) onFavClick();
                closeMenu();
              }}
              className="text-left"
            >
              Mes favoris{favCount > 0 ? " (" + favCount + ")" : ""}
            </button>
          )}
          {showAccount &&
            !authLoading &&
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
