import React, { useState } from "react";
import { ShoppingBag, Menu, X, Instagram, Heart, Sparkles } from "lucide-react";

// ============================================================
// EN-TÊTE ET PIED DE PAGE de la page /quiz
//
// Ils reprennent ceux de la page d'accueil (pages/index.js). Les liens vers l'accueil sont des liens simples (« /#... ») :
// la page se recharge, ce qui garantit que l'ancre ou l'action demandée (ouvrir le panier, une bague, une saison) est lue.
// Pour l'instant, l'en-tête du quiz n'a ni le bouton de compte ni la recherche : le panier, lui, est partagé.
// ============================================================

// À garder identique à FREE_SHIPPING_THRESHOLD de pages/index.js
const FREE_SHIPPING_THRESHOLD = 50;

const NAV = [
  { label: "Collections", href: "/#collections" },
  { label: "Les saisons", href: "/#seasons" },
  { label: "Savoir-faire", href: "/#savoir-faire" },
  { label: "Notre histoire", href: "/#philosophie" },
  { label: "Quiz", href: "/quiz", current: true },
  { label: "Contact", href: "/#contact" },
];

// light : texte clair, pour le pied de page sombre
function CrystalLogo({ light = false }) {
  return (
    <a href="/" aria-label="Zenoria, retour à l'accueil" className="flex items-center gap-3">
      <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-[#bd8792] via-[#d8b36d] to-[#705185] p-[2px] shadow-lg">
        <div className="relative h-full w-full rounded-full bg-[#fbf8f4] overflow-hidden">
          <div className="absolute -left-1 top-0 h-full w-[58%] rounded-r-full bg-gradient-to-br from-[#76518f] to-[#c89aa6]" />
          <div className="absolute right-1 top-1 h-[46%] w-[46%] rounded-full bg-[#fbf8f4]" />
          <div className="absolute left-2 bottom-2 h-2.5 w-2.5 rounded-full bg-[#fbf8f4] ring-1 ring-[#d8b36d]" />
          <div className="absolute right-3 top-3 h-2.5 w-2.5 rotate-45 bg-gradient-to-br from-white to-[#d8b36d] shadow" />
        </div>
      </div>
      <div className={`text-xl tracking-[.22em] font-serif ${light ? "text-white" : "text-[#412f3b]"}`}>ZENORIA</div>
    </a>
  );
}

// onCartClick : si elle est fournie, l'icône du panier appelle cette fonction (la page du quiz pose alors sa question) ;
// sinon, c'est un simple lien vers le panier de l'accueil.
export function QuizHeader({ cartCount = 0, onCartClick }) {
  const [menu, setMenu] = useState(false);
  const cartLabel = cartCount > 0 ? `Ouvrir le panier (${cartCount} article${cartCount > 1 ? "s" : ""})` : "Ouvrir le panier";
  const cartClass = "relative h-10 w-10 grid place-items-center rounded-full hover:bg-[#f0e6ea]";
  const cartInner = (
    <>
      <ShoppingBag size={19} />
      {cartCount > 0 && (
        <span data-testid="header-cart-count" className="absolute right-0 top-0 h-5 min-w-5 px-1 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
          {cartCount}
        </span>
      )}
    </>
  );
  return (
    <header className="sticky top-0 z-40 bg-[#fbf8f4]/95 backdrop-blur border-b border-[#eadfe4]">
      <div className="max-w-7xl mx-auto px-5 h-20 flex items-center justify-between">
        <CrystalLogo />
        <nav className="hidden lg:flex gap-7 text-sm" aria-label="Navigation principale">
          {NAV.map((n) => (
            <a
              key={n.label}
              href={n.href}
              aria-current={n.current ? "page" : undefined}
              className={`hover:text-[#8f6075] ${n.current ? "text-[#8f6075] font-medium border-b border-[#8f6075]" : ""}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          {onCartClick ? (
            <button type="button" onClick={onCartClick} aria-label={cartLabel} data-testid="header-cart" className={cartClass}>
              {cartInner}
            </button>
          ) : (
            <a href="/#panier" aria-label={cartLabel} data-testid="header-cart" className={cartClass}>
              {cartInner}
            </a>
          )}
          <button type="button" className="lg:hidden h-10 w-10 grid place-items-center rounded-full hover:bg-[#f0e6ea]" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={menu ? "Fermer le menu" : "Ouvrir le menu"} data-testid="quiz-menu-toggle">
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {menu && (
        <nav className="lg:hidden px-6 pb-5 flex flex-col gap-3 text-sm" aria-label="Navigation mobile" data-testid="quiz-mobile-menu">
          {NAV.map((n) => (
            <a key={n.label} href={n.href} aria-current={n.current ? "page" : undefined} className={`text-left ${n.current ? "text-[#8f6075] font-medium" : ""}`}>
              {n.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

// Bande de livraison, au-dessus de l'en-tête (comme sur l'accueil)
export function ShippingStrip() {
  return (
    <div className="bg-[#342434] text-white/85 text-[11px] py-2 px-4 text-center tracking-wide">
      Livraison offerte dès {FREE_SHIPPING_THRESHOLD} € · Créations faites à la main en cristaux Swarovski · Paiement sécurisé
    </div>
  );
}

// seasons : [{ key, name }] (noms de l'onglet Familles) ; vide si les familles n'ont pas pu être lues
export function QuizFooter({ seasons = [] }) {
  return (
    <footer className="bg-[#2f252d] text-white/70 py-12 mt-10">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-9">
        <div>
          <CrystalLogo light />
          <p className="text-xs mt-5 leading-6">L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</p>
        </div>
        <div>
          <div className="text-white mb-3">Boutique</div>
          <div className="text-sm space-y-2">
            {seasons.length > 0 ? (
              seasons.map((s) => (
                <p key={s.key}>
                  <a href={`/#saison=${encodeURIComponent(s.key)}`} className="hover:text-white underline-offset-2 hover:underline">
                    {s.name}
                  </a>
                </p>
              ))
            ) : (
              <p>
                <a href="/#collections" className="hover:text-white underline-offset-2 hover:underline">
                  Collections
                </a>
              </p>
            )}
          </div>
        </div>
        <div>
          <div className="text-white mb-3">Informations</div>
          <div className="text-sm space-y-2">
            <p>Livraison et retours</p>
            <p>FAQ</p>
            <p>Mentions légales</p>
            <p>
              <a href="/confidentialite" className="hover:text-white underline-offset-2 hover:underline">
                Politique de confidentialité
              </a>
            </p>
          </div>
        </div>
        <div>
          <div className="text-white mb-3">Suivez-nous</div>
          <div className="flex gap-3">
            <Instagram />
            <Heart />
            <Sparkles />
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-xs">
        <div>Photos et vidéos © 2026 Zenoria, reproduction interdite sans autorisation. Prototype e-commerce.</div>
        <div className="mt-2 text-[11px] text-white/50">Swarovski® est une marque de son propriétaire. Zenoria est une marque indépendante, non affiliée à Swarovski.</div>
      </div>
    </footer>
  );
}
