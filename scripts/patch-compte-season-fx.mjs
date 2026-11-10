#!/usr/bin/env node
// ============================================================
// patch-compte-season-fx.mjs
// ZENORIA_COMPTE_SEASON_FX_V1
//
// Ajoute l'animation saisonniere (feuilles, petales, poussiere doree,
// flocons) sur la page Mon compte (pages/compte.js), entre le bandeau
// "Bonjour" et le menu/contenu. Reutilise INTEGRALEMENT le mecanisme deja
// existant sur l'accueil :
//   - components/SeasonFx.js et lib/seasonFx.js : AUCUNE modification
//   - lib/seasons.js (resolveFxSeason) et lib/siteSettings.js (pickFxSeason,
//     parseSeasonFxSetting, SEASON_FX_KEY) : reutilises tels quels
//
// Le reglage lu est le MEME que celui pilote depuis /admin > Contenu du
// site > Vitrine & ambiance > Animation saisonniere (cle "season_fx" dans
// site_settings) : Automatique / Forcee sur une saison / Desactivee.
// Changer ce reglage affecte donc AUSSI Mon compte, sans reglage separe.
//
// Contrairement a l'accueil, il n'y a pas de clic "saison" possible sur
// Mon compte (pas de cartes saisons a cliquer) : le calcul se limite donc
// a resolveFxSeason(setting, null, maintenant) puis pickFxSeason(setting, ...).
//
// Usage : node scripts/patch-compte-season-fx.mjs
// Idempotent : si deja applique, ne fait rien. Si UNE SEULE ancre ne
// correspond pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE (tout ou rien).
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_COMPTE_SEASON_FX_V1";
const FILE = path.join(process.cwd(), "pages", "compte.js");

function fail(message) {
  console.error(`[patch-compte-season-fx] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-compte-season-fx] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// ------------------------------------------------------------
// Édit 1 : import de SeasonFx (nouveau composant)
// ------------------------------------------------------------
const EDIT_IMPORT_SEASONFX = {
  label: "import SeasonFx",
  from: 'import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H4\n',
  to: 'import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H4\nimport SeasonFx from "@/components/SeasonFx"; // ' + MARK + '\n',
};

// ------------------------------------------------------------
// Édit 2 : élargir l'import siteSettings (SEASON_FX_KEY, parseSeasonFxSetting, pickFxSeason)
// ------------------------------------------------------------
const EDIT_IMPORT_SITESETTINGS = {
  label: "import siteSettings élargi (SEASON_FX_KEY, parseSeasonFxSetting, pickFxSeason)",
  from: 'import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";\n',
  to: 'import { SITE_SETTINGS_TABLE, SEASON_FX_KEY, parseSeasonFxSetting, pickFxSeason } from "@/lib/siteSettings"; // ' + MARK + '\n',
};

// ------------------------------------------------------------
// Édit 3 : import resolveFxSeason depuis lib/seasons
// ------------------------------------------------------------
const EDIT_IMPORT_SEASONS = {
  label: "import resolveFxSeason",
  from: 'import { CUSTOMER_VISIBLE_STATUSES, TRACKING_STEPS, orderStatusInfo, formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay";\n',
  to: 'import { CUSTOMER_VISIBLE_STATUSES, TRACKING_STEPS, orderStatusInfo, formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay";\nimport { resolveFxSeason } from "@/lib/seasons"; // ' + MARK + '\n',
};

// ------------------------------------------------------------
// Édit 4 : nouveaux états fxSetting et nowMs, après heroUrl
// ------------------------------------------------------------
const EDIT_STATE = {
  label: "états fxSetting et nowMs",
  from: '  const [heroUrl, setHeroUrl] = useState(DEFAULT_HERO);\n',
  to:
    '  const [heroUrl, setHeroUrl] = useState(DEFAULT_HERO);\n' +
    '  // ' + MARK + ' : reglage lu dans site_settings (meme cle que l\'accueil) ; nowMs rempli seulement\n' +
    '  // apres l\'affichage, pour que le rendu du serveur ne depende jamais de l\'heure (hydratation stable).\n' +
    '  const [fxSetting, setFxSetting] = useState(() => parseSeasonFxSetting(null));\n' +
    '  const [nowMs, setNowMs] = useState(null);\n' +
    '  useEffect(() => { setNowMs(Date.now()); }, []);\n',
};

// ------------------------------------------------------------
// Édit 5 : charger le réglage season_fx dans le Promise.all existant
// ------------------------------------------------------------
const EDIT_FETCH = {
  label: "chargement du réglage season_fx",
  from:
    '      const [adm, cfg, hero] = await Promise.all([\n' +
    '        supabase.from("admin_users").select("user_id").eq("user_id", u.id).maybeSingle(),\n' +
    '        fetchReviewsSetting(supabase),\n' +
    '        supabase.from(SITE_MEDIA_TABLE).select("path").eq("slot", SITE_SLOT_ACCOUNT_HERO).maybeSingle(),\n' +
    '      ]);\n' +
    '      if (!alive) return;\n' +
    '      setIsAdmin(Boolean(adm && !adm.error && adm.data));\n' +
    '      setReviewsCfg(cfg);\n' +
    '      if (hero && !hero.error && hero.data && hero.data.path) setHeroUrl(getMediaUrl(hero.data.path, "site"));\n',
  to:
    '      const [adm, cfg, hero, fx] = await Promise.all([\n' +
    '        supabase.from("admin_users").select("user_id").eq("user_id", u.id).maybeSingle(),\n' +
    '        fetchReviewsSetting(supabase),\n' +
    '        supabase.from(SITE_MEDIA_TABLE).select("path").eq("slot", SITE_SLOT_ACCOUNT_HERO).maybeSingle(),\n' +
    '        supabase.from(SITE_SETTINGS_TABLE).select("value").eq("key", SEASON_FX_KEY).maybeSingle(), // ' + MARK + '\n' +
    '      ]);\n' +
    '      if (!alive) return;\n' +
    '      setIsAdmin(Boolean(adm && !adm.error && adm.data));\n' +
    '      setReviewsCfg(cfg);\n' +
    '      if (hero && !hero.error && hero.data && hero.data.path) setHeroUrl(getMediaUrl(hero.data.path, "site"));\n' +
    '      // ' + MARK + ' : ligne absente ou illisible -> réglage par défaut (automatique), comme sur l\'accueil\n' +
    '      setFxSetting(parseSeasonFxSetting(fx && !fx.error && fx.data ? fx.data.value : null));\n',
};

// ------------------------------------------------------------
// Édit 6 : rendu de la bande d'animation, entre le hero et la grille menu/contenu
// ------------------------------------------------------------
const EDIT_RENDER = {
  label: "bande d'animation saisonnière (rendu)",
  from:
    '          </section>\n' +
    '\n' +
    '          <div className="grid lg:grid-cols-[230px_1fr] gap-6">\n',
  to:
    '          </section>\n' +
    '\n' +
    '          {/* ' + MARK + ' : meme reglage admin que l\'accueil (Contenu du site > Vitrine & ambiance) */}\n' +
    '          {nowMs !== null && (() => {\n' +
    '            const fxSeason = pickFxSeason(fxSetting, resolveFxSeason(fxSetting, null, new Date(nowMs)));\n' +
    '            return fxSeason ? (\n' +
    '              <div aria-hidden="true" className="relative h-14 sm:h-16 overflow-hidden rounded-xl mb-6">\n' +
    '                <SeasonFx season={fxSeason} />\n' +
    '              </div>\n' +
    '            ) : null;\n' +
    '          })()}\n' +
    '\n' +
    '          <div className="grid lg:grid-cols-[230px_1fr] gap-6">\n',
};

const EDITS = [
  EDIT_IMPORT_SEASONFX,
  EDIT_IMPORT_SITESETTINGS,
  EDIT_IMPORT_SEASONS,
  EDIT_STATE,
  EDIT_FETCH,
  EDIT_RENDER,
];

// ------------------------------------------------------------
// Vérification : chaque ancre doit apparaître EXACTEMENT 1 fois.
// ------------------------------------------------------------
const problems = [];
for (const e of EDITS) {
  const count = content.split(e.from).length - 1;
  if (count !== 1) problems.push(`« ${e.label} » trouvée ${count} fois au lieu de 1`);
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

console.log("[patch-compte-season-fx] pages/compte.js mis à jour :");
console.log("[patch-compte-season-fx]   - animation saisonnière ajoutée entre le bandeau et le menu");
console.log("[patch-compte-season-fx]   - pilotée par le même réglage admin que l'accueil (season_fx)");
