import nodemailer from "nodemailer";
import { config, SmtpSender } from "../config";

// One transporter per configured sender account
const transporters = new Map(
  config.SMTP_SENDERS.map((sender) => [
    sender.id,
    nodemailer.createTransport({
      host: sender.host,
      port: sender.port,
      auth: { user: sender.user, pass: sender.pass },
    }),
  ])
);

export async function sendEmail(
  sender: SmtpSender,
  to: string,
  subject: string,
  body: string
) {
  const transport = transporters.get(sender.id);
  if (!transport) throw new Error(`no transporter for sender ${sender.id}`);

  const info = await transport.sendMail({
    from: sender.user,
    to,
    subject,
    html: body,
  });

  // Ethereal captures the message; this URL lets you preview it
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) console.log("preview:", previewUrl);

  return info;
}
