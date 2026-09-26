export type OutboundEmail = {
  to: string
  toName?: string
  from: string
  replyTo?: string
  subject: string
  text: string
  html?: string
}

export type SendEmailResult = { providerMessageId: string }

export interface EmailProvider {
  sendEmail(message: OutboundEmail): Promise<SendEmailResult>
}

type Runtime = {
  policy: { provider: string; senderName: string; senderEmail: string }
  smtp: Record<string, unknown> | null
  providerSecret: string
  providerConfig: Record<string, unknown>
}

export async function sendWithProvider(runtime: Runtime, message: OutboundEmail): Promise<SendEmailResult> {
  const name = runtime.policy.provider || "smtp"
  if (name === "smtp") return sendSmtp(runtime, message)
  if (name === "sendgrid") return sendJson("https://api.sendgrid.com/v3/mail/send", runtime.providerSecret, sendGridBody(message), "x-message-id")
  if (name === "resend") return sendJson("https://api.resend.com/emails", runtime.providerSecret, { from: message.from, to: [message.to], subject: message.subject, text: message.text, html: message.html, reply_to: message.replyTo }, "id")
  if (name === "postmark") return sendPostmark(runtime.providerSecret, message)
  if (name === "mailgun") return sendMailgun(runtime, message)
  if (name === "ses") return sendSmtp(runtime, message)
  throw new Error(`Email provider ${name} is not configured.`)
}

async function sendSmtp(runtime: Runtime, message: OutboundEmail): Promise<SendEmailResult> {
  const smtp = runtime.smtp
  if (!smtp?.host || (!smtp.from && !runtime.policy.senderEmail)) throw new Error("SMTP is not configured.")
  const nodemailer = await import("nodemailer")
  const transporter = nodemailer.createTransport({
    host: String(smtp.host),
    port: Number(smtp.port || 587),
    secure: Boolean(smtp.secure),
    auth: smtp.user ? { user: String(smtp.user), pass: String(smtp.password || "") } : undefined,
  })
  const from = message.from || String(smtp.from || runtime.policy.senderEmail)
  const sent = await transporter.sendMail({ from, to: message.to, replyTo: message.replyTo, subject: message.subject, text: message.text, html: message.html })
  return { providerMessageId: sent.messageId || `smtp-${Date.now()}` }
}

function sendGridBody(message: OutboundEmail) {
  return {
    personalizations: [{ to: [{ email: message.to, name: message.toName }] }],
    from: { email: message.from },
    reply_to: message.replyTo ? { email: message.replyTo } : undefined,
    subject: message.subject,
    content: [
      { type: "text/plain", value: message.text },
      ...(message.html ? [{ type: "text/html", value: message.html }] : []),
    ],
  }
}

async function sendJson(url: string, token: string, body: unknown, idHeader: string): Promise<SendEmailResult> {
  if (!token) throw new Error("The email provider API key is not configured.")
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Email provider rejected the message (${response.status}).`)
  const headerId = response.headers.get(idHeader)
  if (headerId) return { providerMessageId: headerId }
  const json = (await response.json().catch(() => ({}))) as { id?: string }
  return { providerMessageId: json.id || `provider-${Date.now()}` }
}

async function sendPostmark(token: string, message: OutboundEmail): Promise<SendEmailResult> {
  if (!token) throw new Error("The email provider API key is not configured.")
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "X-Postmark-Server-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ From: message.from, To: message.to, Subject: message.subject, TextBody: message.text, HtmlBody: message.html, ReplyTo: message.replyTo }),
  })
  if (!response.ok) throw new Error(`Email provider rejected the message (${response.status}).`)
  const json = (await response.json()) as { MessageID?: string }
  return { providerMessageId: json.MessageID || `postmark-${Date.now()}` }
}

async function sendMailgun(runtime: Runtime, message: OutboundEmail): Promise<SendEmailResult> {
  const domain = String(runtime.providerConfig.domain || "")
  if (!runtime.providerSecret || !domain) throw new Error("Mailgun domain and API key are required.")
  const body = new URLSearchParams({ from: message.from, to: message.to, subject: message.subject, text: message.text })
  if (message.html) body.set("html", message.html)
  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`api:${runtime.providerSecret}`).toString("base64")}` },
    body,
  })
  if (!response.ok) throw new Error(`Email provider rejected the message (${response.status}).`)
  const json = (await response.json()) as { id?: string }
  return { providerMessageId: json.id || `mailgun-${Date.now()}` }
}
