require("dotenv").config();

const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const { PrismaClient, ContactEmailStatus } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();
const rootDir = __dirname;
const port = Number(process.env.PORT) || 3000;

const runtimeEnvKeys = [
  "DATABASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "CONTACT_TO_EMAIL"
];
const setupEnvKeys = ["DIRECT_URL"];

const missingRuntimeEnv = runtimeEnvKeys.filter((key) => !process.env[key]);
const missingSetupEnv = setupEnvKeys.filter((key) => !process.env[key]);

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .replace(/\r\n/g, "\n")
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }

  return sanitizeText(req.ip, 64) || null;
}

function createTransporter() {
  if (missingRuntimeEnv.some((key) => key.startsWith("SMTP_") || key === "CONTACT_TO_EMAIL")) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE ?? "true").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const transporter = createTransporter();

async function sendContactNotification(submission, req) {
  if (!transporter) {
    throw new Error("SMTP is not configured.");
  }

  const receivedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date());

  const ipAddress = submission.ipAddress ?? "Unavailable";
  const userAgent = submission.userAgent ?? "Unavailable";
  const safeMessage = escapeHtml(submission.message).replace(/\n/g, "<br>");

  await transporter.sendMail({
    from: process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER,
    to: process.env.CONTACT_TO_EMAIL,
    replyTo: submission.email,
    subject: `New portfolio contact from ${submission.name}`,
    text: [
      "You received a new portfolio contact submission.",
      "",
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Received: ${receivedAt}`,
      `IP: ${ipAddress}`,
      `User-Agent: ${userAgent}`,
      "",
      "Message:",
      submission.message
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <h2 style="margin-bottom:8px;">New portfolio contact submission</h2>
        <p style="margin-top:0;">Your website contact form has a new message.</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:4px 12px 4px 0;"><strong>Name</strong></td><td>${escapeHtml(submission.name)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>Email</strong></td><td>${escapeHtml(submission.email)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>Received</strong></td><td>${escapeHtml(receivedAt)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>IP</strong></td><td>${escapeHtml(ipAddress)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;"><strong>User-Agent</strong></td><td>${escapeHtml(userAgent)}</td></tr>
        </table>
        <div style="padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
          <strong>Message</strong>
          <p style="margin:12px 0 0;">${safeMessage}</p>
        </div>
        <p style="margin-top:16px;">You can reply directly to this email to respond to ${escapeHtml(submission.name)}.</p>
      </div>
    `
  });
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", async (_req, res) => {
  const dbConfigured = !missingRuntimeEnv.includes("DATABASE_URL");
  const emailConfigured = !!transporter;

  let database = "not_configured";
  if (dbConfigured) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok";
    } catch (_error) {
      database = "error";
    }
  }

  res.json({
    ok: database === "ok" && emailConfigured,
    database,
    email: emailConfigured ? "ok" : "not_configured",
    missingRuntimeEnv,
    missingSetupEnv
  });
});

app.post("/api/contact", async (req, res) => {
  const honeypot = sanitizeText(req.body.website, 200);
  if (honeypot) {
    return res.status(202).json({ message: "Thanks for your message." });
  }

  if (missingRuntimeEnv.length) {
    return res.status(503).json({
      message: "Contact service is not configured yet. Please finish the .env setup first."
    });
  }

  const name = sanitizeText(req.body.name, 120);
  const email = sanitizeText(req.body.email, 160).toLowerCase();
  const message = sanitizeText(req.body.message, 5000);

  if (!name || !email || !message) {
    return res.status(400).json({
      message: "Name, email, and message are all required."
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      message: "Please enter a valid email address."
    });
  }

  const ipAddress = getClientIp(req);
  const userAgent = sanitizeText(req.get("user-agent"), 512) || null;

  let submission;

  try {
    submission = await prisma.contactSubmission.create({
      data: {
        name,
        email,
        message,
        ipAddress,
        userAgent,
        emailStatus: ContactEmailStatus.PENDING
      }
    });
  } catch (error) {
    console.error("Failed to save contact submission:", error);
    return res.status(500).json({
      message: "I couldn't save your message right now. Please try again in a moment."
    });
  }

  try {
    await sendContactNotification(submission, req);

    await prisma.contactSubmission.update({
      where: { id: submission.id },
      data: {
        emailStatus: ContactEmailStatus.SENT,
        emailedAt: new Date(),
        deliveryError: null
      }
    });

    return res.status(201).json({
      message: "Message sent successfully. It has been saved and emailed to Suvam."
    });
  } catch (error) {
    console.error("Failed to email contact submission:", error);

    await prisma.contactSubmission.update({
      where: { id: submission.id },
      data: {
        emailStatus: ContactEmailStatus.FAILED,
        deliveryError: sanitizeText(error.message, 2000) || "Unknown email delivery error."
      }
    });

    return res.status(500).json({
      message: "Your message was saved, but the notification email failed. Please retry after checking SMTP settings."
    });
  }
});

app.use(express.static(rootDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

async function bootstrap() {
  if (missingRuntimeEnv.length || missingSetupEnv.length) {
    console.warn(
      "Missing environment values:",
      [...missingRuntimeEnv, ...missingSetupEnv].join(", ")
    );
  }

  if (!missingRuntimeEnv.includes("DATABASE_URL")) {
    try {
      await prisma.$connect();
      console.log("Connected to Supabase/Postgres through Prisma.");
    } catch (error) {
      console.error("Prisma failed to connect at startup:", error.message);
    }
  }

  if (transporter) {
    try {
      await transporter.verify();
      console.log("SMTP connection verified.");
    } catch (error) {
      console.error("SMTP verification failed:", error.message);
    }
  }

  app.listen(port, () => {
    console.log(`Portfolio server running at http://localhost:${port}`);
  });
}

bootstrap();

async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
