// ZENORIA_PASSWORD_POLICY_V1 — lancer avec : node tests/passwordPolicy.test.mjs
import assert from "node:assert/strict";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_HELP, validatePassword, validatePasswordConfirmation } from "../lib/passwordPolicy.js";
let passed = 0;
function test(name, fn) { try { fn(); passed += 1; } catch (e) { console.error("ÉCHEC : " + name + "\n  " + e.message); process.exitCode = 1; } }
test("constantes", () => { assert.equal(PASSWORD_MIN_LENGTH, 12); assert.equal(PASSWORD_MAX_LENGTH, 128); assert.equal(PASSWORD_HELP, "Entre 12 et 128 caractères."); });
test("vide et espaces seuls refusés", () => { for (const v of ["", " ", "            ", "\t\n", null, undefined]) { const r=validatePassword(v); assert.equal(r.valid,false,String(v)); assert.equal(r.code,"blank",String(v)); } });
test("11 caractères refusés", () => { const r=validatePassword("a".repeat(11)); assert.equal(r.valid,false); assert.equal(r.code,"too_short"); assert.match(r.message,/12/); });
test("12 caractères acceptés", () => assert.equal(validatePassword("a".repeat(12)).valid,true));
test("128 caractères acceptés", () => assert.equal(validatePassword("é".repeat(128)).valid,true));
test("129 caractères refusés", () => { const r=validatePassword("a".repeat(129)); assert.equal(r.valid,false); assert.equal(r.code,"too_long"); assert.match(r.message,/128/); });
test("phrase avec espaces internes acceptée", () => assert.equal(validatePassword("Bijoux de Violette").valid,true));
test("aucune composition imposée", () => { assert.equal(validatePassword("abcdefghijkl").valid,true); assert.equal(validatePassword("123456789012").valid,true); assert.equal(validatePassword("!!!!!!!!!!!!").valid,true); });
test("confirmation identique", () => assert.equal(validatePasswordConfirmation("abcdefghijkl","abcdefghijkl").valid,true));
test("confirmation différente", () => { const r=validatePasswordConfirmation("abcdefghijkl","abcdefghijkm"); assert.equal(r.valid,false); assert.equal(r.code,"mismatch"); });
test("politique contrôlée avant confirmation", () => assert.equal(validatePasswordConfirmation("court","autre").code,"too_short"));
console.log(passed + " test(s) réussi(s)" + (process.exitCode ? " — échecs ci-dessus." : "."));
