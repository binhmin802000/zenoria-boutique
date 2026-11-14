// ZENORIA_PASSWORD_POLICY_V1
// Politique unique utilisée pour l’inscription, la récupération et Mon compte.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_HELP = `Entre ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caractères.`;
export function validatePassword(value) {
  const password = typeof value === "string" ? value : "";
  if (password.trim().length === 0) return { valid: false, code: "blank", message: "Le mot de passe ne peut pas contenir uniquement des espaces." };
  if (password.length < PASSWORD_MIN_LENGTH) return { valid: false, code: "too_short", message: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.` };
  if (password.length > PASSWORD_MAX_LENGTH) return { valid: false, code: "too_long", message: `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.` };
  return { valid: true, code: "ok", message: "" };
}
export function validatePasswordConfirmation(password, confirmation) {
  const result = validatePassword(password);
  if (!result.valid) return result;
  if (password !== confirmation) return { valid: false, code: "mismatch", message: "Les deux mots de passe ne correspondent pas." };
  return result;
}
