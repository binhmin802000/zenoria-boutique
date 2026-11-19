import assert from "node:assert/strict";
import fs from "node:fs";
const header = fs.readFileSync(new URL("../components/SiteHeader.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../pages/index.js", import.meta.url), "utf8");
assert.match(header, /onLogoClick = null/);
assert.match(header, /onLogoClick \? \(/);
assert.match(header, /data-testid="header-logo-top"/);
assert.match(header, /aria-label="Zenoria, retour en haut de la page"/);
assert.match(header, /logoHref \? \(/); // autres pages : comportement conserve
assert.match(index, /const scrollToPageTop = \(\) =>/);
assert.match(index, /prefers-reduced-motion: reduce/);
assert.match(index, /window\.scrollTo\(\{ top: 0/);
assert.match(index, /onLogoClick=\{scrollToPageTop\}/);
console.log("logoTop.test.mjs : OK");
