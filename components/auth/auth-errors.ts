/** Maps Better Auth error codes to friendly French messages. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe incorrect.",
  INVALID_EMAIL: "Cette adresse email n'est pas valide.",
  INVALID_PASSWORD: "Mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cet email. Connecte-toi plutôt.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cet email. Connecte-toi plutôt.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit faire au moins 8 caractères.",
  PASSWORD_TOO_LONG: "Le mot de passe est trop long.",
  USER_NOT_FOUND: "Aucun compte ne correspond à cet email.",
  EMAIL_NOT_VERIFIED: "Cet email n'a pas été vérifié.",
  FAILED_TO_CREATE_USER: "Impossible de créer le compte pour le moment.",
  config_missing: "L'application n'est pas encore configurée (base de données ou secret manquant).",
};

type AuthError = { code?: string | undefined; message?: string | undefined; status?: number } | null | undefined;

export function authErrorMessage(error: AuthError, fallback = "Une erreur est survenue. Réessaie."): string {
  if (!error) return fallback;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 503) return MESSAGES.config_missing;
  if (error.status === 429) return "Trop de tentatives. Patiente une minute puis réessaie.";
  return error.message && error.message.length < 140 ? error.message : fallback;
}
