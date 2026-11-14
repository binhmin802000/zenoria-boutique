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


// ZENORIA_ACCOUNT_SECURITY_HISTORY_3B_V1 : libellés contrôlés de l’historique administratif.
const AUTH_ACTION_LABELS = {
  password_reset: "Réinitialisation du mot de passe",
};
const AUTH_ACTION_STATUS = {
  pending: { label: "En cours", className: "bg-blue-50 text-blue-700" },
  sent: { label: "Lien envoyé", className: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Échec", className: "bg-red-50 text-red-700" },
  blocked_cooldown: { label: "Refusé · envoi récent", className: "bg-amber-50 text-amber-800" },
  blocked_daily_limit: { label: "Refusé · limite 24 h", className: "bg-amber-50 text-amber-800" },
  blocked_global_limit: { label: "Refusé · limite générale", className: "bg-amber-50 text-amber-800" },
  account_not_found: { label: "Compte introuvable", className: "bg-red-50 text-red-700" },
  email_missing: { label: "Adresse indisponible", className: "bg-red-50 text-red-700" },
  not_available: { label: "Service indisponible", className: "bg-[#f5edf1] text-[#8f6075]" },
};
const AUTH_ACTION_ERRORS = {
  smtp_unavailable: "Service d’envoi temporairement indisponible.",
  provider_rejected: "Envoi refusé par le fournisseur.",
  rate_limit: "Limite d’envoi atteinte.",
  account_not_found: "Le compte ciblé n’existe plus.",
  email_missing: "Aucune adresse e-mail exploitable.",
  unexpected_failure: "Erreur technique inattendue.",
};
export function authActionLabel(action) {
  return AUTH_ACTION_LABELS[action] || "Action de sécurité";
}
export function authActionStatusView(status) {
  return AUTH_ACTION_STATUS[status] || { label: "Résultat inconnu", className: "bg-[#f5edf1] text-[#8f6075]" };
}
export function authActionErrorLabel(errorCode) {
  if (!errorCode) return "";
  return AUTH_ACTION_ERRORS[errorCode] || "Erreur technique enregistrée.";
}
