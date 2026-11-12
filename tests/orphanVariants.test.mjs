// Tests : les miniatures et images fixes ne sont plus proposees comme « fichiers orphelins » (lib/orphanFiles.js).
// Lancer : node tests/orphanVariants.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { classifyFiles, deleteOrphans, withVariantPaths, buildReferenceSet } from "../lib/orphanFiles.js";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const OLD = "2026-11-13T00:01:00Z"; // plus d'une heure avant NOW
const RECENT = "2026-11-13T11:30:00Z"; // 30 minutes avant NOW
const f = (name, created_at = OLD, size = 1000, mimetype = "") => ({ name, created_at, size_bytes: size, mimetype });

const products = [
  { slug: "rose", photos: ["rose/1-a.jpg", "rose/2-b.jpg", "IMG_ancien.jpg"], video: "rose/3-v.mp4" },
  { slug: "verte", photos: ["https://x.supabase.co/storage/v1/object/public/product-media/verte/4-c.jpg"], video: null },
];
const siteRows = [{ slot: "hero_video", path: "site/hero_video/9-hero.mp4" }, { slot: "savoir_faire_photo", path: "site/savoir_faire_photo/8-sf.jpg" }];

const files = [
  f("rose/1-a.jpg"), f("rose/thumb_1-a.jpg", OLD, 60000),
  f("rose/2-b.jpg"), // pas de miniature : normal
  f("rose/3-v.mp4"), f("rose/poster_3-v.jpg"),
  f("verte/4-c.jpg"), f("verte/thumb_4-c.jpg"), // reference ecrite sous forme d'adresse complete
  f("site/hero_video/9-hero.mp4"), f("site/hero_video/poster_9-hero.jpg"),
  f("site/savoir_faire_photo/8-sf.jpg"),
  f("rose/thumb_7-supprimee.jpg", OLD, 55000), // miniature dont l'original n'existe plus ni n'est utilise : vraie orpheline
  f("rose/poster_6-vieille.jpg"), // idem pour une image fixe
  f("rose/5-abandon.jpg", OLD, 90000), // vrai envoi abandonne
  f("rose/thumb_5-abandon.jpg", OLD, 40000), // sa miniature : orpheline aussi
];
const data = { files, products, siteRows, truncated: false };
const paths = (r) => r.orphans.map((o) => o.path).sort();

test("miniatures et images fixes d'originaux utilises : jamais orphelines", () => {
  const r = classifyFiles(data, NOW);
  for (const p of ["rose/thumb_1-a.jpg", "rose/poster_3-v.jpg", "verte/thumb_4-c.jpg", "site/hero_video/poster_9-hero.jpg"]) {
    assert.ok(!paths(r).includes(p), p + " ne doit pas etre proposee");
  }
});

test("seules les vraies orphelines restent proposees (envoi abandonne, miniature sans original utilise)", () => {
  assert.deepEqual(paths(classifyFiles(data, NOW)), ["rose/5-abandon.jpg", "rose/poster_6-vieille.jpg", "rose/thumb_5-abandon.jpg", "rose/thumb_7-supprimee.jpg"]);
});

test("compteur « utilises » : les fichiers utilises ET leurs variantes", () => {
  assert.equal(classifyFiles(data, NOW).used, 10);
});

test("reference ecrite sous forme d'adresse complete : sa miniature est protegee", () => {
  assert.ok(!paths(classifyFiles(data, NOW)).includes("verte/thumb_4-c.jpg"));
});

test("« references vers un fichier absent » : inchange, les variantes ne creent AUCUNE fausse alerte", () => {
  const r = classifyFiles(data, NOW);
  assert.equal(r.broken, 0); // aucune photo reference n'est absente (ancien format ignore)
  const missing = classifyFiles({ ...data, files: files.filter((x) => x.name !== "rose/2-b.jpg") }, NOW);
  assert.equal(missing.broken, 1); // une vraie reference absente est toujours detectee, une seule fois
});

test("liste tronquee : broken reste null (comportement inchange)", () => {
  assert.equal(classifyFiles({ ...data, truncated: true }, NOW).broken, null);
});

test("fichier recent : toujours verrouille (regle des 60 minutes inchangee)", () => {
  const r = classifyFiles({ ...data, files: [f("rose/thumb_7-supprimee.jpg", RECENT)] }, NOW);
  assert.equal(r.orphans.length, 1);
  assert.equal(r.orphans[0].recent, true);
  assert.equal(r.orphans[0].selectable, false);
});

test("sans aucune miniature en stockage : resultat identique a avant", () => {
  const plain = [f("rose/1-a.jpg"), f("rose/2-b.jpg"), f("rose/9-orph.jpg", OLD, 5)];
  const r = classifyFiles({ files: plain, products, siteRows: [], truncated: false }, NOW);
  assert.deepEqual(paths(r), ["rose/9-orph.jpg"]);
  assert.equal(r.used, 2);
});

test("withVariantPaths : ajoute les variantes sans modifier l'ensemble d'origine", () => {
  const refs = new Set(["a/1-x.jpg", "a/2-v.mp4", "ancien.jpg"]);
  const out = withVariantPaths(refs);
  assert.deepEqual([...out].sort(), ["a/1-x.jpg", "a/2-v.mp4", "a/poster_2-v.jpg", "a/thumb_1-x.jpg", "ancien.jpg"]);
  assert.equal(refs.size, 3);
  assert.deepEqual([...buildReferenceSet(products, siteRows)].includes("rose/thumb_1-a.jpg"), false); // buildReferenceSet reste « pur »
});

// ---------- Suppression : meme protection, y compris si l'on force ----------
function fakeClient({ prods = products, site = siteRows } = {}) {
  const removed = [];
  return {
    removed,
    from(table) { return { select: async () => ({ data: table === "products" ? prods : site, error: null }) }; },
    storage: { from: () => ({ remove: async (chunk) => { chunk.forEach((p) => removed.push(p)); return { data: chunk.map((name) => ({ name })), error: null }; } }) },
  };
}
const sel = (name, createdAt = OLD, size = 1000) => ({ path: name, size, createdAt });

test("suppression : une miniature d'un original utilise n'est JAMAIS supprimee, meme demandee", async () => {
  const c = fakeClient();
  const r = await deleteOrphans(c, [sel("rose/thumb_1-a.jpg"), sel("rose/poster_3-v.jpg"), sel("site/hero_video/poster_9-hero.jpg")], NOW);
  assert.deepEqual(c.removed, []);
  assert.deepEqual(r.skippedUsed.sort(), ["rose/poster_3-v.jpg", "rose/thumb_1-a.jpg", "site/hero_video/poster_9-hero.jpg"]);
  assert.equal(r.bytesFreed, 0);
});

test("suppression : une vraie orpheline (et sa miniature) reste supprimable", async () => {
  const c = fakeClient();
  const r = await deleteOrphans(c, [sel("rose/5-abandon.jpg", OLD, 90000), sel("rose/thumb_5-abandon.jpg", OLD, 40000)], NOW);
  assert.deepEqual(c.removed.sort(), ["rose/5-abandon.jpg", "rose/thumb_5-abandon.jpg"]);
  assert.equal(r.bytesFreed, 130000);
});

test("suppression : mix — seules les orphelines sont supprimees, les protegees sont conservees", async () => {
  const c = fakeClient();
  const r = await deleteOrphans(c, [sel("rose/thumb_1-a.jpg"), sel("rose/thumb_7-supprimee.jpg", OLD, 55000), sel("rose/1-a.jpg")], NOW);
  assert.deepEqual(c.removed, ["rose/thumb_7-supprimee.jpg"]);
  assert.deepEqual(r.skippedUsed.sort(), ["rose/1-a.jpg", "rose/thumb_1-a.jpg"]);
});

test("suppression : la relecture des references protege aussi une photo devenue utilisee entre-temps", async () => {
  const c = fakeClient({ prods: [...products, { slug: "neuf", photos: ["neuf/1-z.jpg"], video: null }] });
  const r = await deleteOrphans(c, [sel("neuf/thumb_1-z.jpg")], NOW);
  assert.deepEqual(c.removed, []);
  assert.deepEqual(r.skippedUsed, ["neuf/thumb_1-z.jpg"]);
});

test("suppression : fichier recent toujours refuse", async () => {
  const c = fakeClient();
  const r = await deleteOrphans(c, [sel("rose/thumb_7-supprimee.jpg", RECENT)], NOW);
  assert.deepEqual(c.removed, []);
  assert.deepEqual(r.skippedRecent, ["rose/thumb_7-supprimee.jpg"]);
});
