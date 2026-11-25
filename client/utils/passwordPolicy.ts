/** Mirrors server/utils/passwordPolicy.js (server remains authoritative). */
export const PASSWORD_MIN = 8;

export function passwordPolicyError(password: string): string | null {
  if (!password) return "Please enter a password.";
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters long.`;
  if (password.length > 128) return "Password must be at most 128 characters long.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain at least one letter and one number.";
  return null;
}
