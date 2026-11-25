/**
 * server/utils/mailer.js
 * NEXUSFLOW Phase 2 (Task 1) — e-mail transport abstraction.
 *
 * Works with any free SMTP service (e.g. Gmail SMTP with an app password,
 * Brevo/Sendinblue free tier) via nodemailer. Nothing is configured or
 * signed into automatically.
 *
 * Env: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ("true" for 465), SMTP_USER,
 *      SMTP_PASS, SMTP_FROM, PASSWORD_RESET_BASE_URL (falls back to FRONTEND_URL).
 *
 * If SMTP is not configured, sendMail() returns { delivered:false,
 * reason:"not_configured" } — callers must never claim delivery.
 * Tests inject a mock transport with setMailTransportForTests().
 */
import nodemailer from "nodemailer";
import { logger } from "./logger.js";

let injectedTransport = null;
let cachedTransport = null;
let cachedKey = "";

export function setMailTransportForTests(transport) {
  injectedTransport = transport;
}

export function isMailerConfigured() {
  if (injectedTransport) return true;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

function getTransport() {
  if (injectedTransport) return injectedTransport;
  if (!isMailerConfigured()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const key = `${process.env.SMTP_HOST}:${port}:${process.env.SMTP_USER}`;
  if (!cachedTransport || cachedKey !== key) {
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    cachedKey = key;
  }
  return cachedTransport;
}

/** @returns {Promise<{delivered:boolean, reason?:string}>} */
export async function sendMail({ to, subject, text, html }) {
  const transport = getTransport();
  if (!transport) {
    logger.warn("mailer:not_configured", { purpose: subject });
    return { delivered: false, reason: "not_configured" };
  }
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM || "NexusFlow <no-reply@localhost>", to, subject, text, html });
    return { delivered: true };
  } catch (err) {
    // Sanitized: never log credentials, tokens or the message body.
    logger.error("mailer:delivery_failed", { purpose: subject, code: err?.code || "SEND_FAILED" });
    return { delivered: false, reason: "delivery_failed" };
  }
}

export function passwordResetBaseUrl() {
  const raw = process.env.PASSWORD_RESET_BASE_URL || process.env.FRONTEND_URL || "http://localhost:8081";
  return raw.replace(/\/+$/, "");
}

export async function sendPasswordResetEmail({ to, name, token, expiresMinutes }) {
  const link = `${passwordResetBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = `${greeting}\n\nWe received a request to reset your NexusFlow password.\nOpen this link within ${expiresMinutes} minutes to choose a new password:\n\n${link}\n\nIf you did not request this, you can ignore this e-mail; your password will not change.`;
  const html = `<p>${greeting.replace(/[<>&]/g, "")}</p><p>We received a request to reset your NexusFlow password.</p><p><a href="${link}">Choose a new password</a> (valid for ${expiresMinutes} minutes).</p><p>If you did not request this, you can ignore this e-mail.</p>`;
  return sendMail({ to, subject: "Reset your NexusFlow password", text, html });
}
