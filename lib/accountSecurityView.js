// ZENORIA_ACCOUNT_SECURITY_READ_V1
export function accountDisplayName(account) {
  const profile = account && account.profile;
  const fullName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() : "";
  return fullName || (account && account.email) || "Compte client";
}
export function accountAccessState(account) {
  if (!account) return { code: "unknown", label: "État indisponible", tone: "neutral", detail: "Les informations du compte ne sont pas disponibles." };
  if (!account.confirmed_at) return { code: "unconfirmed", label: "Adresse non confirmée", tone: "warn", detail: "La confirmation de l’adresse n’est pas obligatoire dans la configuration actuelle de Zenoria." };
  if (!account.last_sign_in_at) return { code: "never", label: "Compte confirmé, jamais utilisé", tone: "neutral", detail: "Aucune connexion n’a encore été enregistrée." };
  return { code: "active", label: "Compte actif", tone: "ok", detail: "La cliente s’est déjà connectée à son espace personnel." };
}
export function activeSessionsLabel(value) {
  if (value === null || value === undefined || value === "") return "Information indisponible";
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return "Information indisponible";
  if (count === 0) return "Aucune session active";
  if (count === 1) return "1 session active";
  return Math.trunc(count) + " sessions actives";
}
export function resetAvailability() {
  return { enabled: false, label: "Envoi des e-mails non disponible", detail: "Le domaine d’envoi Zenoria doit être vérifié dans Resend avant de pouvoir envoyer un lien de réinitialisation aux clientes." };
}
