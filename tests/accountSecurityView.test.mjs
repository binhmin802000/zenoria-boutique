// ZENORIA_ACCOUNT_SECURITY_READ_V1 — node tests/accountSecurityView.test.mjs
import assert from "node:assert/strict";
import { accountDisplayName, accountAccessState, activeSessionsLabel, resetAvailability } from "../lib/accountSecurityView.js";
let passed = 0;
function test(name, fn) { try { fn(); passed += 1; } catch (error) { console.error("ÉCHEC : " + name + "\n  " + error.message); process.exitCode = 1; } }
test("nom complet", () => assert.equal(accountDisplayName({ email: "a@b.fr", profile: { first_name: "Marie", last_name: "Durand" } }), "Marie Durand"));
test("repli sur e-mail", () => assert.equal(accountDisplayName({ email: "a@b.fr", profile: null }), "a@b.fr"));
test("non confirmé", () => assert.equal(accountAccessState({ confirmed_at: null, last_sign_in_at: null }).code, "unconfirmed"));
test("jamais utilisé", () => assert.equal(accountAccessState({ confirmed_at: "2026-01-01", last_sign_in_at: null }).code, "never"));
test("actif", () => assert.equal(accountAccessState({ confirmed_at: "2026-01-01", last_sign_in_at: "2026-02-01" }).code, "active"));
test("sessions", () => { assert.equal(activeSessionsLabel(0), "Aucune session active"); assert.equal(activeSessionsLabel(1), "1 session active"); assert.equal(activeSessionsLabel(3), "3 sessions actives"); });
test("sessions absentes", () => assert.equal(activeSessionsLabel(null), "Information indisponible"));
test("envoi bloqué", () => { const value = resetAvailability(); assert.equal(value.enabled, false); assert.match(value.detail, /Resend/); });
console.log(passed + " test(s) réussi(s)" + (process.exitCode ? " — échecs ci-dessus." : "."));
