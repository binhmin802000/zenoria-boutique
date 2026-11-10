#!/usr/bin/env node
// ============================================================
// patch-mobile-menu.mjs
// ZENORIA_ADMIN_MOBILE_MENU_V1
//
// Rend le menu de navigation de l'admin (pages/admin.js) entierement
// masque sur mobile par defaut, avec un bouton hamburger dans l'en-tete
// qui l'ouvre en overlay (plein ecran, fond sombre semi-transparent).
//
// Sur desktop (sm: et plus), AUCUN changement de comportement : le
// mecanisme existant (survol du bord gauche, epinglage via la fleche)
// continue de fonctionner a l'identique.
//
// Usage : node scripts/patch-mobile-menu.mjs
// Idempotent : si deja applique, ne fait rien. Si UNE SEULE ancre ne
// correspond pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_ADMIN_MOBILE_MENU_V1";
const FILE = path.join(process.cwd(), "pages", "admin.js");

function fail(message) {
  console.error(`[patch-mobile-menu] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-mobile-menu] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// ------------------------------------------------------------
// Édit 1 : ajouter "Menu" à l'import lucide-react
// ------------------------------------------------------------
const EDIT_IMPORT = {
  label: "import lucide-react : ajout de Menu",
  from: 'import { Plus, Pencil, Trash2, X, LogOut, Tag, Package, ArrowLeft, Upload, Film, Users, Sparkles, Gauge, Wrench, Activity, Settings, LogIn, Clock, Palette, ShoppingBag, ChevronDown, ChevronLeft, ChevronRight, ShieldCheck, CreditCard, FileText, SlidersHorizontal } from "lucide-react"; // ZENORIA_ADMIN_NAV_5A_V1 : icônes du groupe Réglages\n',
  to: 'import { Plus, Pencil, Trash2, X, LogOut, Tag, Package, ArrowLeft, Upload, Film, Users, Sparkles, Gauge, Wrench, Activity, Settings, LogIn, Clock, Palette, ShoppingBag, ChevronDown, ChevronLeft, ChevronRight, ShieldCheck, CreditCard, FileText, SlidersHorizontal, Menu } from "lucide-react"; // ZENORIA_ADMIN_NAV_5A_V1 : icônes du groupe Réglages, Menu ajouté par ' + MARK + '\n',
};

// ------------------------------------------------------------
// Édit 2 : ajouter l'état mobileMenuOpen, juste après sidebarHover
// ------------------------------------------------------------
const EDIT_STATE = {
  label: "état mobileMenuOpen",
  from: '  const [sidebarHover, setSidebarHover] = useState(false);\n  const sidebarCollapsed = !(sidebarPinned || sidebarHover); // vrai quand seules les icônes sont affichées\n',
  to: '  const [sidebarHover, setSidebarHover] = useState(false);\n  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // ' + MARK + ' : menu mobile (hamburger), independant du survol desktop\n  const sidebarCollapsed = !(sidebarPinned || sidebarHover || mobileMenuOpen); // vrai quand seules les icônes sont affichées\n',
};

// ------------------------------------------------------------
// Édit 3 : fermer aussi le menu mobile dans closeSidebarNow
// ------------------------------------------------------------
const EDIT_CLOSE = {
  label: "closeSidebarNow ferme aussi le menu mobile",
  from: '  const closeSidebarNow = () => {\n    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);\n    sidebarTimer.current = null;\n    setSidebarHover(false);\n  };\n',
  to: '  const closeSidebarNow = () => {\n    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);\n    sidebarTimer.current = null;\n    setSidebarHover(false);\n    setMobileMenuOpen(false); // ' + MARK + '\n  };\n',
};

// ------------------------------------------------------------
// Édit 4 : la touche Échap ferme aussi le menu mobile
// ------------------------------------------------------------
const EDIT_ESCAPE = {
  label: "Échap ferme aussi le menu mobile",
  from: '    const onKey = (e) => {\n      if (e.key === "Escape") {\n        if (sidebarTimer.current) clearTimeout(sidebarTimer.current);\n        sidebarTimer.current = null;\n        setSidebarHover(false);\n      }\n    };\n',
  to: '    const onKey = (e) => {\n      if (e.key === "Escape") {\n        if (sidebarTimer.current) clearTimeout(sidebarTimer.current);\n        sidebarTimer.current = null;\n        setSidebarHover(false);\n        setMobileMenuOpen(false); // ' + MARK + '\n      }\n    };\n',
};

// ------------------------------------------------------------
// Édit 5 : bouton hamburger dans l'en-tête (visible seulement sur mobile)
// ------------------------------------------------------------
const EDIT_HEADER = {
  label: "bouton hamburger dans l'en-tête",
  from:
    '            <a href="/" className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label="Retour au site">\n' +
    '              <ArrowLeft size={18} />\n' +
    '            </a>\n' +
    '            <div className="font-serif text-xl">Administration Zenoria</div>\n',
  to:
    '            <a href="/" className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label="Retour au site">\n' +
    '              <ArrowLeft size={18} />\n' +
    '            </a>\n' +
    '            {/* ' + MARK + ' : bouton hamburger, visible uniquement sur mobile */}\n' +
    '            <button\n' +
    '              type="button"\n' +
    '              onClick={() => setMobileMenuOpen((v) => !v)}\n' +
    '              data-testid="mobile-menu-toggle"\n' +
    '              aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}\n' +
    '              className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea] sm:hidden"\n' +
    '            >\n' +
    '              <Menu size={18} />\n' +
    '            </button>\n' +
    '            <div className="font-serif text-xl">Administration Zenoria</div>\n',
};

// ------------------------------------------------------------
// Édit 6 : <aside> responsive (masqué sur mobile sauf si ouvert, overlay plein écran)
// ------------------------------------------------------------
const EDIT_ASIDE = {
  label: "<aside> responsive (overlay mobile)",
  from:
    '          className={`shrink-0 sticky top-20 self-start z-20 ${sidebarPinned ? "w-60" : "w-14"}`}\n' +
    '          onMouseEnter={queueSidebarOpen}\n' +
    '          onMouseLeave={queueSidebarClose}\n' +
    '        >\n',
  to:
    '          className={`${mobileMenuOpen ? "fixed inset-0 z-50 bg-black/40" : "hidden"} sm:block sm:static sm:bg-transparent sm:z-20 sm:shrink-0 sm:sticky sm:top-20 sm:self-start ${sidebarPinned ? "sm:w-60" : "sm:w-14"}`} /* ' + MARK + ' */\n' +
    '          onMouseEnter={queueSidebarOpen}\n' +
    '          onMouseLeave={queueSidebarClose}\n' +
    '          onClick={(e) => { if (e.target === e.currentTarget) setMobileMenuOpen(false); }} // ' + MARK + ' : clic sur le fond (mobile) ferme le menu\n' +
    '        >\n',
};

const EDITS = [EDIT_IMPORT, EDIT_STATE, EDIT_CLOSE, EDIT_ESCAPE, EDIT_HEADER, EDIT_ASIDE];

// ------------------------------------------------------------
// Vérification : chaque ancre doit apparaître EXACTEMENT 1 fois.
// ------------------------------------------------------------
const problems = [];
for (const e of EDITS) {
  const count = content.split(e.from).length - 1;
  if (count !== 1) {
    problems.push(`« ${e.label} » trouvée ${count} fois au lieu de 1`);
  }
}

if (problems.length > 0) {
  fail(
    "au moins une ancre ne correspond pas. Fichier modifié depuis, ou texte différent de ce qui a été vérifié. " +
    "Rien n'a été écrit. Détail :\n  - " + problems.join("\n  - ")
  );
}

// ------------------------------------------------------------
// Application (tout ou rien, déjà validé ci-dessus)
// ------------------------------------------------------------
let updated = content;
for (const e of EDITS) {
  updated = updated.replace(e.from, () => e.to);
}

if ((updated.match(new RegExp(MARK, "g")) || []).length < 6) {
  fail("contrôle final : le marqueur devrait apparaître au moins 6 fois après patch.");
}

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-mobile-menu] pages/admin.js mis à jour : menu mobile en overlay ajouté.");
console.log("[patch-mobile-menu] Le comportement desktop (sm: et plus) n'est pas modifié.");
