import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let cachedTransport = null;

const isSmtpConfigured = () => Boolean(env.smtp.host?.trim());

const getTransport = () => {
  if (!isSmtpConfigured()) return null;
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return cachedTransport;
};

export const sendPasswordResetCode = async ({ to, code }) => {
  const transport = getTransport();
  const subject = "Tu código de recuperación de contraseña";
  const text = [
    "Recibimos una solicitud para restablecer tu contraseña en AutoBot.",
    "",
    `Tu código de verificación es: ${code}`,
    "",
    "Este código expira en 15 minutos. Si no solicitaste este cambio, ignora este correo.",
  ].join("\n");
  const html = `
    <p>Recibimos una solicitud para restablecer tu contraseña en <strong>AutoBot</strong>.</p>
    <p>Tu código de verificación es:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
    <p>Este código expira en 15 minutos. Si no solicitaste este cambio, ignora este correo.</p>
  `;

  if (!transport) {
    console.info(`[password-reset] código para ${to}: ${code}`);
    return;
  }

  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject,
    text,
    html,
  });
};
