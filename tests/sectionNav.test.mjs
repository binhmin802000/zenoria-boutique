import assert from "node:assert/strict";
import fs from "node:fs";
const libCode = fs.readFileSync(new URL("../lib/sectionNav.js", import.meta.url), "utf8");
const { computeSectionTargets, scrollTopFor } = await import("data:text/javascript;base64," + Buffer.from(libCode).toString("base64"));
const s = [{ id: "a", label: "A", top: 700 }, { id: "c", label: "C", top: 2500 }, { id: "b", label: "B", top: 1500 }];
// au-dessus de la premiere section : pas de precedente, suivante = A
let t = computeSectionTargets(s, 300); assert.equal(t.prev, null); assert.equal(t.next.id, "a");
// exactement sur B (sous le header) : precedente A, suivante C
t = computeSectionTargets(s, 1500 - 80); assert.equal(t.prev.id, "a"); assert.equal(t.next.id, "c");
// au milieu de B : precedente B (debut du bloc courant), suivante C
t = computeSectionTargets(s, 1900); assert.equal(t.prev.id, "b"); assert.equal(t.next.id, "c");
// apres la derniere : pas de suivante
t = computeSectionTargets(s, 3000); assert.equal(t.prev.id, "c"); assert.equal(t.next, null);
assert.equal(scrollTopFor(null), 0);
assert.equal(scrollTopFor({ top: 1500 }), 1420);
const comp = fs.readFileSync(new URL("../components/SectionNav.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../pages/index.js", import.meta.url), "utf8");
for (const term of ["prefers-reduced-motion", "hover: hover", "safe-area-inset-right", "aria-label=\"Navigation entre les sections\"", "section-nav-up", "section-nav-down", "Section suivante : ", "opacity-0 pointer-events-none"]) assert.equal(comp.includes(term), true, term);
for (const term of ["import SectionNav", "SECTION_NAV_ITEMS", "<SectionNav", "cartOpen || favPanelOpen", "authModalOpen", "\"notre-histoire\"", "\"quiz\""]) assert.equal(index.includes(term), true, term);
console.log("sectionNav.test.mjs : OK");
