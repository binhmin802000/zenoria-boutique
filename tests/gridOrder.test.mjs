// Tests de lib/gridOrder.js (lot R1) — se lancent avec : node tests/gridOrder.test.mjs
import {
  gridOrderIds, applyIdOrder, periodIndex, parisHour, parseGridOrderSetting, hash32, DEFAULT_GRID_ORDER,
} from "../lib/gridOrder.js";
import { parisOffsetMinutes } from "../lib/parisTime.js";

let ok = true;
const check = (c, m) => {
  ok = ok && c;
  console.log((c ? "OK  " : "KO  ") + m);
};
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: "B" + (i + 1) }));
const P = mk(14);
const T = Date.UTC(2026, 10, 9, 12, 0, 0); // 9 novembre 2026, midi UTC

// 1. Déterminisme et indépendance de l'ordre d'entrée
const a = gridOrderIds(P, { nowMs: T });
const b = gridOrderIds([...P].reverse(), { nowMs: T });
check(a.join() === gridOrderIds(P, { nowMs: T }).join(), "même instant, même ordre");
check(a.join() === b.join(), "l'ordre de la base (liste inversée) ne change pas le résultat");
check(new Set(a).size === 14 && a.length === 14, "toutes les bagues présentes, sans doublon");

// 2. Périodes : l'ordre change quand la période change, pas avant
const p1 = gridOrderIds(P, { nowMs: Date.UTC(2026, 10, 9, 1, 59) });
const p2 = gridOrderIds(P, { nowMs: Date.UTC(2026, 10, 9, 2, 0) });
const p3 = gridOrderIds(P, { nowMs: Date.UTC(2026, 10, 9, 22, 0) });
check(p1.join() !== p2.join(), "09/11 02:59 Paris -> 03:00 Paris : l'ordre change");
check(p2.join() === p3.join(), "03:00 -> 23:00 le même jour : l'ordre ne change pas");

// 3. Fréquence N
const wk = (d, h = 12, m = 0) => gridOrderIds(P, { nowMs: Date.UTC(2026, 10, d, h, m), setting: { everyDays: 7 } }).join();
check(wk(9) === wk(15) && wk(15) !== wk(16), "N = 7 : même ordre du lundi 9 au dimanche 15, nouvel ordre le lundi 16");
check(wk(16, 1, 59) === wk(15), "N = 7 : encore l'ancien ordre le lundi 16 à 02:59 (Paris)");

// 4. « Mélanger maintenant » : la date du dernier mélange change la recette
const s1 = gridOrderIds(P, { nowMs: T, setting: { shuffledAt: "2026-11-09T10:00:00.000Z" } });
const s2 = gridOrderIds(P, { nowMs: T, setting: { shuffledAt: "2026-11-09T10:00:00.001Z" } });
check(s1.join() !== a.join(), "un mélange manuel donne un nouvel ordre sans attendre la rotation");
check(s1.join() !== s2.join(), "deux mélanges à 1 ms d'écart donnent deux ordres différents");
check(s1.join() === gridOrderIds(P, { nowMs: T, setting: { shuffledAt: "2026-11-09T10:00:00.000Z" } }).join(), "même date de mélange : même ordre pour tout le monde");
check(gridOrderIds(P, { nowMs: Date.UTC(2026, 10, 10, 12), setting: { shuffledAt: "2026-11-09T10:00:00.000Z" } }).join() !== s1.join(), "après un mélange, la rotation de 3 h continue de changer l'ordre");

// 5. Mode manuel : ordre de la base
check(gridOrderIds(P, { nowMs: T, setting: { mode: "manual" } }).join() === P.map((p) => p.id).join(), "mode manuel : ordre de la base inchangé");

// 6. Classement : commandables d'abord
const sold = new Set([2, 5, 9, 12]);
const ids = gridOrderIds(P, { nowMs: T, isOrderable: (p) => !sold.has(p.id) });
check(ids.slice(10).every((id) => sold.has(id)) && ids.slice(0, 10).every((id) => !sold.has(id)), "les 4 indisponibles sont en fin de grille (positions 11 à 14)");
check(ids.slice(0, 10).join() !== P.filter((p) => !sold.has(p.id)).map((p) => p.id).join(), "les 10 commandables sont bien mélangés entre eux");
check(gridOrderIds(P, { nowMs: T, isOrderable: () => { throw new Error("x"); } }).length === 14, "isOrderable qui échoue : la grille s'affiche quand même");

// 7. Un nouveau bijou ne bouleverse pas les autres
const P15 = [...P, { id: 15, name: "Nouveau" }];
const base = gridOrderIds(P, { nowMs: T });
check(base.join() === gridOrderIds(P15, { nowMs: T }).filter((id) => id !== 15).join(), "bijou ajouté : l'ordre relatif des 14 autres est identique");
const shown = applyIdOrder(P15, base);
check(shown[14].id === 15 && shown.slice(0, 14).map((p) => p.id).join() === base.join(), "bijou arrivé après le chargement : en fin de grille, les autres ne bougent pas");

// 8. Figé : un stock modifié après le chargement ne déplace rien
const restocked = applyIdOrder(P.map((p) => ({ ...p, stock: p.id === 1 ? 0 : 1 })), base);
check(restocked.map((p) => p.id).join() === base.join(), "stock modifié après le chargement : positions inchangées");
check(applyIdOrder(P, []).map((p) => p.id).join() === P.map((p) => p.id).join(), "ordre vide : liste d'origine conservée");

// 9. Équité : chaque bague passe en tête, et en dernier, à peu près aussi souvent
const N = 7000;
const first = new Array(14).fill(0);
const last = new Array(14).fill(0);
for (let k = 0; k < N; k++) {
  const o = gridOrderIds(P, { nowMs: Date.UTC(2026, 0, 5) + k * 86400000 + 12 * 3600000 });
  first[o[0] - 1]++;
  last[o[13] - 1]++;
}
const exp = N / 14;
check(Math.min(...first) > exp * 0.85 && Math.max(...first) < exp * 1.15, "équité sur " + N + " jours : en tête " + Math.min(...first) + " à " + Math.max(...first) + " fois par bague (attendu environ " + Math.round(exp) + ")");
check(Math.min(...last) > exp * 0.85 && Math.max(...last) < exp * 1.15, "équité : en dernière position " + Math.min(...last) + " à " + Math.max(...last) + " fois");

// 10. Changement à 3 h pile toute l'année 2026, changements d'heure compris.
// Pour chaque jour de l'année : on calcule l'instant exact de « 03:00 à Paris », puis on vérifie que le numéro de période
// est le même à 02:59 et change (ou non) à 03:00 selon N.
function parisThreeAmUtc(y, m, d) {
  const base = Date.UTC(y, m, d, 3, 0, 0);
  for (const off of [60, 120]) {
    const t = base - off * 60000;
    if (parisOffsetMinutes(t) === off && parisHour(t) === 3) return t;
  }
  return NaN;
}
const EXPECTED = { 1: 365, 2: 183, 5: 73, 7: 52, 30: 13 };
for (const n of [1, 2, 5, 7, 30]) {
  let changes = 0, bad = 0;
  for (let d = 0; d < 365; d++) {
    const t = parisThreeAmUtc(2026, 0, 1 + d);
    if (!Number.isFinite(t)) { bad++; continue; }
    const before = periodIndex(t - 60000, n), at = periodIndex(t, n), later = periodIndex(t + 20 * 3600000, n);
    if (at < before || at - before > 1 || later !== at) bad++;
    if (at !== before) changes++;
  }
  check(changes === EXPECTED[n] && bad === 0, "N = " + n + " : " + changes + " changements en 2026 (attendu " + EXPECTED[n] + "), chacun à 03:00 Paris pile, aucune anomalie");
}
const dst = (iso) => periodIndex(Date.parse(iso), 1);
check(dst("2026-03-29T00:59:00Z") + 1 === dst("2026-03-29T01:00:00Z"), "passage à l'heure d'été (29/03) : changement à 03:00 locale = 01:00 UTC");
check(dst("2026-10-25T01:59:00Z") + 1 === dst("2026-10-25T02:00:00Z"), "passage à l'heure d'hiver (25/10) : changement à 03:00 locale = 02:00 UTC");
check(dst("2026-10-25T00:30:00Z") === dst("2026-10-25T01:30:00Z"), "l'heure répétée du 25/10 (02:30 deux fois) ne déclenche aucun changement");
check(parisHour(Date.UTC(2026, 6, 1, 1, 0)) === 3 && parisHour(Date.UTC(2026, 11, 1, 2, 0)) === 3, "03:00 à Paris = 01:00 UTC l'été, 02:00 UTC l'hiver");

// 11. Réglage : valeurs invalides -> défaut champ par champ
check(JSON.stringify(parseGridOrderSetting(null)) === JSON.stringify(DEFAULT_GRID_ORDER), "réglage absent : aléatoire, tous les jours, jamais mélangé");
check([0, 31, 2.5, "x", -3, null].every((v) => parseGridOrderSetting({ everyDays: v }).everyDays === 1), "N hors de 1 à 30, décimal ou illisible : retour à 1");
check(parseGridOrderSetting({ everyDays: 30 }).everyDays === 30 && parseGridOrderSetting({ everyDays: 1 }).everyDays === 1 && parseGridOrderSetting({ everyDays: "7" }).everyDays === 7, "bornes 1 et 30 acceptées, « 7 » en texte accepté");
check(parseGridOrderSetting({ mode: "n'importe quoi" }).mode === "random" && parseGridOrderSetting({ mode: "manual" }).mode === "manual", "mode inconnu : aléatoire ; « manual » reconnu");
check(parseGridOrderSetting({ shuffledAt: "pas une date" }).shuffledAt === "" && parseGridOrderSetting({ shuffledAt: 12345 }).shuffledAt === "" && parseGridOrderSetting({ shuffledAt: "" }).shuffledAt === "", "date de mélange illisible : ignorée");
check(parseGridOrderSetting({ shuffledAt: "2026-11-09T10:00:00Z" }).shuffledAt === "2026-11-09T10:00:00.000Z", "date de mélange valide : normalisée en ISO");
check(parseGridOrderSetting([1, 2]).everyDays === 1 && parseGridOrderSetting("x").mode === "random", "valeur qui n'est pas un objet : défaut");

// 12. Cas limites
check(gridOrderIds([], { nowMs: T }).length === 0 && gridOrderIds(null, { nowMs: T }).length === 0, "liste vide ou nulle : aucun plantage");
check(gridOrderIds(P.slice(0, 1), { nowMs: T }).join() === "1", "une seule bague");
check(hash32("0|0|1") === hash32("0|0|1") && hash32("a") !== hash32("b"), "empreinte stable");
check(gridOrderIds(P, { nowMs: NaN }).length === 14, "heure illisible : la grille s'affiche quand même (heure courante)");

console.log(ok ? "\nTOUS LES CONTROLES OK" : "\nECHEC");
process.exit(ok ? 0 : 1);
