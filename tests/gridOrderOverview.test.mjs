// Tests de lib/gridOrderOverview.js (lot R4) — se lancent avec : node tests/gridOrderOverview.test.mjs
import { gridOrderOverviewItems, isGridOrderValueReadable } from "../lib/gridOrderOverview.js";

let ok = true;
const check = (c, m) => {
  ok = ok && c;
  console.log((c ? "OK  " : "KO  ") + m);
};
// Même format que formatWhen de lib/configOverview.js (heure de Paris)
const formatWhen = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
};
const by = (items, id) => items.find((i) => i.id === id);
const row = (value) => ({ key: "grid_order", value, updated_at: "2026-11-06T14:00:00.000Z", updated_by_email: "admin@exemple.fr" });

// 1. Aucune ligne : comportement par défaut, jamais « Non défini »
const none = gridOrderOverviewItems(null, formatWhen);
check(none.length === 3 && none.map((i) => i.id).join() === "grid_mode,grid_every,grid_shuffle", "rien d'enregistré : 3 lignes (grid_mode, grid_every, grid_shuffle)");
check(by(none, "grid_mode").text === "Aléatoire (par défaut)" && by(none, "grid_mode").sub === "Rien d'enregistré : réglage par défaut", "rien d'enregistré : « Aléatoire (par défaut) » — " + by(none, "grid_mode").text);
check(by(none, "grid_every").text === "Chaque jour à 3 h (par défaut)" && by(none, "grid_every").sub === "Heure de Paris", "rien d'enregistré : « Chaque jour à 3 h (par défaut) » — " + by(none, "grid_every").text);
check(by(none, "grid_shuffle").text === "Jamais", "rien d'enregistré : dernier mélange « Jamais »");
check(none.every((i) => i.missing === false && !JSON.stringify(i).includes("Non défini") && i.tone === undefined), "rien d'enregistré : aucune ligne « manquante », aucune alerte");
check(JSON.stringify(gridOrderOverviewItems(undefined, formatWhen)) === JSON.stringify(none) && JSON.stringify(gridOrderOverviewItems(false, formatWhen)) === JSON.stringify(none), "undefined et false : comme null");

// 2. Aléatoire enregistré
const r1 = gridOrderOverviewItems(row({ mode: "random", everyDays: 1, shuffledAt: "" }), formatWhen);
check(by(r1, "grid_mode").text === "Aléatoire" && by(r1, "grid_mode").sub === "Le même ordre pour tous les visiteurs", "aléatoire enregistré : « Aléatoire » (sans « par défaut »)");
check(by(r1, "grid_every").text === "Chaque jour à 3 h", "N = 1 : « Chaque jour à 3 h »");
const r7 = gridOrderOverviewItems(row({ mode: "random", everyDays: 7, shuffledAt: "" }), formatWhen);
check(by(r7, "grid_every").text === "Tous les 7 jours à 3 h" && by(r7, "grid_every").sub === "Heure de Paris", "N = 7 : « Tous les 7 jours à 3 h »");
check(by(gridOrderOverviewItems(row({ mode: "random", everyDays: 30, shuffledAt: "" }), formatWhen), "grid_every").text === "Tous les 30 jours à 3 h", "N = 30 : « Tous les 30 jours à 3 h »");
check(by(gridOrderOverviewItems(row({ mode: "random", everyDays: 2, shuffledAt: "" }), formatWhen), "grid_every").text === "Tous les 2 jours à 3 h", "N = 2 : « Tous les 2 jours à 3 h »");

// 3. Manuel
const m = gridOrderOverviewItems(row({ mode: "manual", everyDays: 7, shuffledAt: "" }), formatWhen);
check(by(m, "grid_mode").text === "Manuel" && by(m, "grid_mode").sub === "Ordre de la base, comme avant", "manuel : « Manuel », « Ordre de la base, comme avant »");
check(by(m, "grid_every").text === "Sans effet en mode manuel" && by(m, "grid_every").sub === "Fréquence conservée : 7 jours", "manuel : « Sans effet en mode manuel », « Fréquence conservée : 7 jours »");
check(by(gridOrderOverviewItems(row({ mode: "manual", everyDays: 1, shuffledAt: "" }), formatWhen), "grid_every").sub === "Fréquence conservée : 1 jour", "manuel, N = 1 : « 1 jour » au singulier");

// 4. Dernier mélange : heure de Paris, pas celle du navigateur
const sh = gridOrderOverviewItems(row({ mode: "random", everyDays: 1, shuffledAt: "2026-11-09T15:00:32.123Z" }), formatWhen);
check(by(sh, "grid_shuffle").text === "09/11/2026 16:00", "dernier mélange 15:00 UTC = 16:00 à Paris : « 09/11/2026 16:00 » — " + by(sh, "grid_shuffle").text);
const shSummer = gridOrderOverviewItems(row({ mode: "random", everyDays: 1, shuffledAt: "2026-07-01T10:00:00Z" }), formatWhen);
check(by(shSummer, "grid_shuffle").text === "01/07/2026 12:00", "en été : 10:00 UTC = 12:00 à Paris");
check(by(gridOrderOverviewItems(row({ mode: "random", everyDays: 1, shuffledAt: "2026-11-09T15:00:32Z" }), (v) => "[" + v + "]"), "grid_shuffle").text === "[2026-11-09T15:00:32.000Z]", "la fonction de date transmise est bien celle utilisée (valeur normalisée en ISO)");
check(by(gridOrderOverviewItems(row({ mode: "random", everyDays: 1, shuffledAt: "2026-11-09T15:00:32Z" }), () => ""), "grid_shuffle").text === "Jamais", "date que la fonction ne sait pas formater : « Jamais » plutôt qu'une ligne vide");
check(by(gridOrderOverviewItems(row({ mode: "random", everyDays: 1, shuffledAt: "2026-11-09T15:00:32Z" })), "grid_shuffle").text.length > 0, "sans fonction de date : valeur affichée tout de même");

// 5. Valeur illisible : une seule ligne, en alerte (la contrainte SQL l'interdit, mais la page ne doit jamais planter)
const bad = [
  null, "texte", 5, [], [1, 2], {}, { mode: "n_importe_quoi", everyDays: 7, shuffledAt: "" }, { mode: "random", everyDays: 0, shuffledAt: "" }, { mode: "random", everyDays: 31, shuffledAt: "" },
  { mode: "random", everyDays: 2.5, shuffledAt: "" }, { mode: "random", everyDays: "x", shuffledAt: "" }, { mode: "random", shuffledAt: "" }, { mode: "random", everyDays: 7, shuffledAt: 5 },
  { mode: "random", everyDays: 7, shuffledAt: "pas une date" }, { everyDays: 7 }, { mode: "manual" },
];
check(bad.every((v) => { const it = gridOrderOverviewItems(row(v), formatWhen); return it.length === 1 && it[0].id === "grid_mode" && it[0].text === "Valeur illisible" && it[0].tone === "warn" && it[0].missing === false && it[0].sub.includes("réglage par défaut"); }), "valeur illisible (" + bad.length + " cas : texte, nombre, tableau, mode inconnu, jours hors bornes ou décimaux, date illisible…) : une ligne « Valeur illisible » en alerte");
check(gridOrderOverviewItems({ key: "grid_order" }, formatWhen)[0].text === "Valeur illisible", "ligne sans champ value : « Valeur illisible »");

// 6. Valeurs acceptées par la base = valeurs lisibles ici (même règle que la contrainte site_settings_grid_order_valid)
const good = [{ mode: "random", everyDays: 1, shuffledAt: "" }, { mode: "manual", everyDays: 30, shuffledAt: "2026-11-06T14:32:10.123Z" }, { mode: "random", everyDays: 7 }, { mode: "random", everyDays: 1.0, shuffledAt: "" }];
check(good.every((v) => isGridOrderValueReadable(v) && gridOrderOverviewItems(row(v), formatWhen).length === 3), "les 4 valeurs que la base accepte (test SQL) sont lisibles : 3 lignes chacune");
check(["random", "manual"].every((md) => [1, 2, 7, 15, 30].every((n) => isGridOrderValueReadable({ mode: md, everyDays: n, shuffledAt: "" }))), "tous les modes et fréquences valides sont lisibles");

// 7. Forme des lignes : celle que lib/configOverview.js et son affichage attendent
const all = [none, r1, r7, m, sh].flat();
check(all.every((i) => typeof i.id === "string" && typeof i.label === "string" && typeof i.text === "string" && i.text.length > 0 && typeof i.missing === "boolean" && (i.sub === undefined || typeof i.sub === "string") && (i.tone === undefined || ["ok", "warn", "crit"].includes(i.tone)) && i.flag === undefined), "forme des lignes : { id, label, text, sub?, tone?, missing } comme les autres réglages (jamais de flag)");
check(new Set(all.map((i) => i.id)).size === 3, "identifiants stables : grid_mode, grid_every, grid_shuffle");
check(all.every((i) => !/undefined|NaN|null|\[object/.test(i.label + " " + i.text + " " + (i.sub || ""))), "aucun « undefined », « NaN », « null » ni « [object » dans les textes affichés");

// 8. Pas d'effet de bord
const frozenRow = Object.freeze(row(Object.freeze({ mode: "random", everyDays: 7, shuffledAt: "" })));
let threw = false;
try { gridOrderOverviewItems(frozenRow, formatWhen); } catch (e) { threw = true; }
check(!threw, "ligne figée (Object.freeze) : aucune modification de l'entrée");

console.log(ok ? "\nTOUS LES CONTROLES OK" : "\nECHEC");
process.exit(ok ? 0 : 1);
