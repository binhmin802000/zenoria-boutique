// ZENORIA_ACCOUNT_SECURITY_HISTORY_3B_V1 — node tests/accountSecurityHistory.test.mjs
import assert from "node:assert/strict";
import { authActionLabel, authActionStatusView, authActionErrorLabel } from "../lib/accountSecurityView.js";
let passed = 0;
function test(name, fn) { try { fn(); passed += 1; } catch (error) { console.error("ÉCHEC : " + name + "\n  " + error.message); process.exitCode = 1; } }
test("action mot de passe", () => assert.equal(authActionLabel("password_reset"), "Réinitialisation du mot de passe"));
test("action inconnue", () => assert.equal(authActionLabel("future_action"), "Action de sécurité"));
for (const status of ["pending", "sent", "failed", "blocked_cooldown", "blocked_daily_limit", "blocked_global_limit", "account_not_found", "email_missing", "not_available"]) {
  test("statut " + status, () => { const view = authActionStatusView(status); assert.ok(view.label); assert.ok(view.className); });
}
test("statut inconnu", () => assert.equal(authActionStatusView("future").label, "Résultat inconnu"));
test("sans erreur", () => assert.equal(authActionErrorLabel(null), ""));
test("erreur connue", () => assert.match(authActionErrorLabel("provider_rejected"), /fournisseur/));
test("erreur inconnue neutre", () => assert.equal(authActionErrorLabel("private_raw_message"), "Erreur technique enregistrée."));
console.log(passed + " test(s) réussi(s)" + (process.exitCode ? " — échecs ci-dessus." : "."));
