/**
 * server/utils/passwordPolicy.js
 * NEXUSFLOW Phase 2 — single password policy for signup and reset.
 * 8–128 characters with at least one letter and one digit.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function validatePassword(password) {
  if (typeof password !== "string" || password.length === 0) return "Password is required.";
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters long.`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters long.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain at least one letter and one number.";
  return null;
}
