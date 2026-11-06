// Tests de lib/gridOrderSettings.js (lot R3) — se lancent avec : node tests/gridOrderSettings.test.mjs
import {
  GRID_ORDER_KEY, parseEveryDaysInput, buildGridOrderValue, shuffledValue, sameGridOrderSetting,
  parisRotationMs, periodBounds, formatGridMoment, formatShuffleMoment, describeGridOrder, formatGridOrderLogValue,
} from "../lib/gridOrderSettings.js";
import { parseGridOrderSetting, periodIndex, parisHour, gridOrderIds } from "../lib/gridOrder.js";
import { parisOffsetMinutes } from "../lib/parisTime.js";

let ok = true;
const check = (c, m) => {
  ok = ok && c;
  console.log((c ? "OK  " : "KO  ") + m);
};

// 1. Clé du réglage : celle que la base accepte
check(GRID_ORDER_KEY === "grid_order" && /^[a-z][a-z0-9_]{0,39}$/.test(GRID_ORDER_KEY), "clé « grid_order » conforme à la contrainte site_settings_key_format de la base");

// 2. Saisie de la fréquence
const good = { "1": 1, " 7 ": 7, "07": 7, "30": 30, "7 jours": 7, "1 jour": 1, "5j": 5, "12 J": 12 };
check(Object.entries(good).every(([t, n]) => { const r = parseEveryDaysInput(t); return r.ok && r.value === n && r.error === ""; }), "saisies acceptées : 1, ' 7 ', 07, 30, '7 jours', '1 jour', '5j', '12 J'");
const bad = ["", "  ", "0", "31", "-3", "2.5", "2,5", "abc", "7 semaines", "1000", "1e1", null, undefined];
check(bad.every((t) => { const r = parseEveryDaysInput(t); return !r.ok && r.value === null && r.error.length > 10; }), "saisies refusées avec un message : vide, 0, 31, -3, 2.5, 2,5, texte, 1000, 1e1, null");
check(parseEveryDaysInput("0").error.includes("entre 1 et 30") && parseEveryDaysInput("abc").error.includes("nombre entier"), "messages : hors bornes (« entre 1 et 30 ») et non numérique (« nombre entier »)");

// 3. Valeur à enregistrer : toujours acceptée par la contrainte de la base
// (mode random|manual ; everyDays entier de 1 à 30 ; shuffledAt texte de 40 caractères au plus)
const dbOk = (v) => v && typeof v === "object" && ["random", "manual"].includes(v.mode) && Number.isInteger(v.everyDays) && v.everyDays >= 1 && v.everyDays <= 30 && typeof v.shuffledAt === "string" && v.shuffledAt.length <= 40 && Object.keys(v).length === 3;
check([null, undefined, {}, { mode: "x", everyDays: 99, shuffledAt: 5 }, { mode: "manual", everyDays: "7" }, [1], "x"].every((s) => dbOk(buildGridOrderValue(s))), "buildGridOrderValue : toute entrée donne une valeur que la contrainte de la base accepte");
check(JSON.stringify(buildGridOrderValue(null)) === JSON.stringify({ mode: "random", everyDays: 1, shuffledAt: "" }), "réglage absent : { random, 1, '' } (la valeur par défaut du site)");
check(JSON.stringify(buildGridOrderValue({ mode: "manual", everyDays: 12, shuffledAt: "2026-11-06T14:32:10.123Z" })) === JSON.stringify({ mode: "manual", everyDays: 12, shuffledAt: "2026-11-06T14:32:10.123Z" }), "valeur valide : conservée telle quelle");

// 4. « Mélanger maintenant »
const T = Date.UTC(2026, 10, 6, 13, 32, 10, 123);
const sv = shuffledValue({ mode: "random", everyDays: 7, shuffledAt: "" }, T);
check(sv.shuffledAt === "2026-11-06T13:32:10.123Z" && sv.mode === "random" && sv.everyDays === 7 && dbOk(sv), "mélange : mode et fréquence conservés, instant enregistré en ISO, valeur acceptée par la base");
check(shuffledValue(null, T).mode === "random" && shuffledValue(null, T).everyDays === 1, "mélange sans réglage enregistré : valeurs par défaut + instant");
check(shuffledValue({ mode: "manual" }, T).mode === "manual", "mélange : le mode manuel est conservé (le bouton sera désactivé, mais la fonction ne le change pas)");
check(shuffledValue({}, NaN) === null && shuffledValue({}, "x") === null && shuffledValue({}, 8.64e15 + 1) === null, "instant illisible ou hors limites : null, aucun plantage");
const base14 = () => Array.from({ length: 14 }, (_, i) => ({ id: i + 1 }));
const orderA = gridOrderIds(base14(), { nowMs: T, setting: { mode: "random", everyDays: 1, shuffledAt: "" } });
const orderB = gridOrderIds(base14(), { nowMs: T, setting: sv });
check(orderA.join() !== orderB.join(), "le mélange change réellement l'ordre vu par les visiteurs (avec la vraie logique de lib/gridOrder.js)");

// 5. Comparaison des réglages
check(sameGridOrderSetting({ mode: "random", everyDays: 7, shuffledAt: "" }, { mode: "random", everyDays: 7, shuffledAt: "2026-11-06T13:32:10.123Z" }), "même mode et même fréquence : identiques, quelle que soit la date de mélange");
check(!sameGridOrderSetting({ mode: "random", everyDays: 7 }, { mode: "random", everyDays: 8 }) && !sameGridOrderSetting({ mode: "random", everyDays: 7 }, { mode: "manual", everyDays: 7 }), "fréquence ou mode différents : non identiques");
check(sameGridOrderSetting(null, { mode: "random", everyDays: 1 }), "réglage absent = valeur par défaut");

// 6. Instant de « 3 h 00 à Paris » pour chaque jour de 2026 et 2027
let badRot = 0, count = 0;
for (let d = 0; d < 730; d++) {
  const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
  const t = parisRotationMs(day);
  count++;
  const local = new Date(t + parisOffsetMinutes(t) * 60000);
  if (!Number.isFinite(t) || parisHour(t) !== 3 || local.getUTCMinutes() !== 0 || local.getUTCSeconds() !== 0 || local.toISOString().slice(0, 10) !== day) badRot++;
}
check(badRot === 0, "parisRotationMs : les " + count + " jours de 2026-2027 donnent exactement 03:00:00 à Paris, le bon jour (changements d'heure compris)");
check(parisRotationMs("2026-03-29") === Date.UTC(2026, 2, 29, 1, 0, 0) && parisRotationMs("2026-10-25") === Date.UTC(2026, 9, 25, 2, 0, 0) && parisRotationMs("2026-07-01") === Date.UTC(2026, 6, 1, 1, 0, 0) && parisRotationMs("2026-12-01") === Date.UTC(2026, 11, 1, 2, 0, 0), "03:00 Paris = 01:00 UTC en été (dont le 29/03), 02:00 UTC en hiver (dont le 25/10)");
check(["", "x", "2026-13-40x", null, undefined, "2026/11/06"].every((v) => Number.isNaN(parisRotationMs(v))), "jour illisible : NaN, aucun plantage");

// 7. Bornes de la période, cohérentes avec periodIndex (celui qui décide de l'ordre).
// Instants testés : toute l'année 2026 (un instant tous les 2 jours et 2 h environ) + un instant toutes les 20 minutes autour des deux changements d'heure
const sample = [];
for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 50 * 3600000 + 777) sample.push(t);
for (const [m, d] of [[2, 28], [2, 29], [9, 24], [9, 25]]) for (let k = 0; k < 72; k++) sample.push(Date.UTC(2026, m, d) + k * 20 * 60000);
for (const n of [1, 2, 5, 7, 30]) {
  let bad = 0;
  for (const t of sample) {
    const b = periodBounds(t, n);
    const okBounds =
      Number.isFinite(b.startMs) && Number.isFinite(b.nextMs) &&
      b.startMs <= t && t < b.nextMs &&
      periodIndex(b.startMs, n) === b.period && periodIndex(b.startMs - 1, n) === b.period - 1 &&
      periodIndex(b.nextMs - 1, n) === b.period && periodIndex(b.nextMs, n) === b.period + 1 &&
      b.nextMs - b.startMs >= n * 86400000 - 3600000 && b.nextMs - b.startMs <= n * 86400000 + 3600000;
    if (!okBounds) bad++;
  }
  check(bad === 0, "N = " + n + " : " + sample.length + " instants de 2026 (dont les 4 jours des changements d'heure), début et prochain changement toujours cohérents avec periodIndex, durée de " + n + " jour(s) à 1 h près");
}
check(Number.isFinite(periodBounds(Date.UTC(2025, 5, 1), 7).startMs) && periodBounds(Date.UTC(2025, 5, 1), 7).period < 0, "avant la date d'ancrage (2026) : période négative, bornes calculées quand même");
check(periodBounds(T, 0).period === periodBounds(T, 1).period && periodBounds(T, "x").period === periodBounds(T, 1).period, "fréquence invalide : valeur par défaut (1 jour), aucun plantage");
const b7 = periodBounds(Date.UTC(2026, 10, 12, 10, 0), 7);
check(b7.startMs === Date.UTC(2026, 10, 9, 2, 0) && b7.nextMs === Date.UTC(2026, 10, 16, 2, 0), "N = 7, jeudi 12/11/2026 : début lundi 9/11 à 03:00 Paris, prochain changement lundi 16/11 à 03:00 Paris");
const b1 = periodBounds(Date.UTC(2026, 10, 9, 1, 59), 1);
check(b1.startMs === Date.UTC(2026, 10, 8, 2, 0) && b1.nextMs === Date.UTC(2026, 10, 9, 2, 0), "N = 1, lundi 9/11 à 02:59 Paris : encore la période commencée dimanche à 03:00, prochain changement lundi à 03:00");

// 8. Textes
check(formatGridMoment(Date.UTC(2026, 10, 16, 2, 0)).includes("lundi 16 novembre") && /03[:h]00/.test(formatGridMoment(Date.UTC(2026, 10, 16, 2, 0))), "formatGridMoment : « lundi 16 novembre … 03:00 » (heure de Paris), obtenu : " + formatGridMoment(Date.UTC(2026, 10, 16, 2, 0)));
check(formatGridMoment(NaN) === "—" && formatGridMoment(undefined) === "—", "formatGridMoment : valeur illisible -> tiret");
check(formatShuffleMoment("2026-11-06T13:32:10.123Z").includes("6 novembre 2026") && /14[:h]32/.test(formatShuffleMoment("2026-11-06T13:32:10.123Z")), "formatShuffleMoment : 13:32 UTC = 14:32 à Paris en novembre, obtenu : " + formatShuffleMoment("2026-11-06T13:32:10.123Z"));
check(["", null, undefined, "pas une date", 5].every((v) => formatShuffleMoment(v) === "jamais"), "formatShuffleMoment : vide ou illisible -> « jamais »");
check(describeGridOrder(null) === "aléatoire, nouvel ordre chaque jour à 3 h (heure de Paris)", "description par défaut : " + describeGridOrder(null));
check(describeGridOrder({ mode: "random", everyDays: 7 }) === "aléatoire, nouvel ordre tous les 7 jours à 3 h (heure de Paris)", "description N = 7");
check(describeGridOrder({ mode: "manual" }).startsWith("manuel :"), "description du mode manuel");

// 9. Journal des changements
check(formatGridOrderLogValue("mode", "random") === "aléatoire" && formatGridOrderLogValue("mode", "manual") === "ordre de la base", "journal : mode lisible");
check(formatGridOrderLogValue("everyDays", 1) === "1 jour" && formatGridOrderLogValue("everyDays", 7) === "7 jours" && formatGridOrderLogValue("everyDays", "30") === "30 jours", "journal : « 1 jour », « 7 jours »");
check(formatGridOrderLogValue("shuffledAt", "2026-11-06T13:32:10.123Z").includes("6 novembre 2026"), "journal : date du mélange lisible");
check(["auto", "forced", "off", "once", "loop", "vanish", "full", "stars"].every((m) => formatGridOrderLogValue("mode", m) === null) && formatGridOrderLogValue("speed", "slow") === null, "journal : les « mode » des AUTRES réglages (auto, forced, off, once, loop, vanish, full, stars) ne sont pas touchés (null = affichage habituel)");

// 10. Cohérence avec le parseur de R1
check(JSON.stringify(parseGridOrderSetting(buildGridOrderValue({ mode: "manual", everyDays: 9 }))) === JSON.stringify({ mode: "manual", everyDays: 9, shuffledAt: "" }), "écrire puis relire le réglage donne la même chose");

console.log(ok ? "\nTOUS LES CONTROLES OK" : "\nECHEC");
process.exit(ok ? 0 : 1);
