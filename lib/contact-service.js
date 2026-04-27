const nodemailer = require("nodemailer");
const { Pool } = require("pg");

const runtimeEnvKeys = ["DATABASE_URL_OR_DIRECT_URL"];
const emailEnvKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "CONTACT_TO_EMAIL"];
const setupEnvKeys = [];

const globalState = globalThis;

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .replace(/\r\n/g, "\n")
    .slice(0, maxLength);
}

function sanitizeSingleLineText(value, maxLength) {
  return sanitizeText(value, maxLength).replace(/[\r\n]+/g, " ");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitRecipientList(rawValue) {
  return String(rawValue ?? "")
    .split(/[;,]/)
    .map((value) => sanitizeSingleLineText(value, 320))
    .filter(Boolean);
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }

  return sanitizeText(req.ip || req.socket?.remoteAddress, 64) || null;
}

function getUserAgent(req) {
  if (typeof req.get === "function") {
    return sanitizeText(req.get("user-agent"), 512) || null;
  }

  return sanitizeText(req.headers?.["user-agent"], 512) || null;
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  const protocolIndex = rawUrl.indexOf("://");
  if (protocolIndex === -1) {
    return null;
  }

  const parsedUrl = new URL(rawUrl);
  const remainder = rawUrl.slice(protocolIndex + 3);
  const slashIndex = remainder.indexOf("/");
  const authority = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
  const userInfoEndIndex = authority.lastIndexOf("@");

  if (userInfoEndIndex === -1) {
    return null;
  }

  const userInfo = authority.slice(0, userInfoEndIndex);
  const passwordSeparatorIndex = userInfo.indexOf(":");
  const rawUsername =
    passwordSeparatorIndex === -1 ? userInfo : userInfo.slice(0, passwordSeparatorIndex);
  const rawPassword =
    passwordSeparatorIndex === -1 ? "" : userInfo.slice(passwordSeparatorIndex + 1);

  return {
    user: safeDecode(rawUsername),
    password: safeDecode(rawPassword),
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
    database: safeDecode(parsedUrl.pathname.replace(/^\//, "")) || "postgres"
  };
}

function getResolvedDatabaseConfig() {
  const rawConnectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  const databaseConfig = parseDatabaseUrl(rawConnectionString);
  if (!databaseConfig) {
    return null;
  }

  return {
    ...databaseConfig,
    password: process.env.SUPABASE_DB_PASSWORD || databaseConfig.password
  };
}

function getPoolConfig() {
  const databaseConfig = getResolvedDatabaseConfig();
  if (!databaseConfig) {
    return null;
  }

  const isLocalDatabase =
    databaseConfig.host === "localhost" || databaseConfig.host === "127.0.0.1";

  return {
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    password: databaseConfig.password,
    database: databaseConfig.database,
    max: Number(process.env.DB_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: isLocalDatabase ? false : { rejectUnauthorized: false }
  };
}

function getPool() {
  if (!getResolvedDatabaseConfig()) {
    return null;
  }

  if (!globalState.__portfolioPgPool) {
    const pool = new Pool(getPoolConfig());
    pool.on("error", (error) => {
      console.error("Unexpected Postgres pool error:", error.message);
    });
    globalState.__portfolioPgPool = pool;
  }

  return globalState.__portfolioPgPool;
}

function getEmailConfig() {
  const host = sanitizeSingleLineText(process.env.SMTP_HOST, 255);
  const port = Number(process.env.SMTP_PORT);
  const user = sanitizeSingleLineText(process.env.SMTP_USER, 320);
  const pass = process.env.SMTP_PASS || "";
  const to = splitRecipientList(process.env.CONTACT_TO_EMAIL);

  if (!host || !Number.isFinite(port) || !user || !pass || !to.length) {
    return null;
  }

  return {
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    user,
    pass,
    to,
    from: sanitizeSingleLineText(process.env.CONTACT_FROM_EMAIL, 320) || user
  };
}

function getEmailTransporter() {
  const emailConfig = getEmailConfig();
  if (!emailConfig) {
    return null;
  }

  const existing = globalState.__portfolioMailTransporter;
  if (existing?.cacheKey === JSON.stringify(emailConfig)) {
    return existing.transporter;
  }

  const transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: {
      user: emailConfig.user,
      pass: emailConfig.pass
    },
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  });

  globalState.__portfolioMailTransporter = {
    cacheKey: JSON.stringify(emailConfig),
    transporter
  };

  return transporter;
}

function getMissingEnv() {
  const hasConnectionConfig = !!getResolvedDatabaseConfig();
  const hasEmailConfig = !!getEmailConfig();

  return {
    missingRuntimeEnv: [
      ...(hasConnectionConfig ? [] : runtimeEnvKeys),
      ...(hasEmailConfig ? [] : emailEnvKeys.filter((key) => !process.env[key]))
    ],
    missingSetupEnv: setupEnvKeys.filter((key) => !process.env[key])
  };
}

function getDatabaseFailureMessage(error) {
  const rawMessage = sanitizeText(error?.message, 400);

  if (/authentication failed|password authentication failed/i.test(rawMessage)) {
    return "The Supabase database password is being rejected. Re-copy the current password into DATABASE_URL or DIRECT_URL and URL-encode special characters like @ as %40.";
  }

  if (/relation .*contact_submissions.* does not exist/i.test(rawMessage)) {
    return "The contact_submissions table was not found in Supabase. Create it before submitting messages.";
  }

  if (/self signed certificate|ssl/i.test(rawMessage)) {
    return "The database connection requires SSL. Recheck the Supabase connection string.";
  }

  return "I couldn't save your message right now. Please try again in a moment.";
}

function getEmailFailureMessage(error) {
  const rawMessage = sanitizeText(error?.message, 400);

  if (/invalid login|auth|authentication/i.test(rawMessage)) {
    return "The inbox could not be reached because the SMTP login was rejected. Recheck the mailbox address and app password.";
  }

  if (/greeting/i.test(rawMessage)) {
    return "The mail server did not finish connecting in time. Please try again in a moment.";
  }

  return "I saved your message, but I could not send it to the inbox just now. Please try again in a moment.";
}

async function getHealthPayload() {
  const { missingRuntimeEnv, missingSetupEnv } = getMissingEnv();
  const pool = getPool();
  const transporter = getEmailTransporter();

  let database = "not_configured";
  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "ok";
    } catch (_error) {
      database = "error";
    }
  }

  let email = "not_configured";
  if (transporter) {
    try {
      await transporter.verify();
      email = "ok";
    } catch (_error) {
      email = "error";
    }
  }

  return {
    ok: database === "ok" && email === "ok",
    database,
    email,
    missingRuntimeEnv,
    missingSetupEnv
  };
}

async function saveSubmission(pool, submission) {
  if (!pool) {
    return null;
  }

  const result = await pool.query(
    `
      INSERT INTO contact_submissions ("name", "email", "message", "ipAddress", "userAgent")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [
      submission.name,
      submission.email,
      submission.message,
      submission.ipAddress,
      submission.userAgent
    ]
  );

  return result.rows[0]?.id || null;
}

async function updateSubmissionEmailState(pool, submissionId, emailStatus, deliveryError) {
  if (!pool || !submissionId) {
    return;
  }

  await pool.query(
    `
      UPDATE contact_submissions
      SET "emailStatus" = $2,
          "emailedAt" = CASE WHEN $2 = 'SENT' THEN NOW() ELSE NULL END,
          "deliveryError" = $3
      WHERE id = $1
    `,
    [submissionId, emailStatus, deliveryError]
  );
}

function buildEmailContent(submission) {
  const escapedMessage = submission.message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");

  const escapedName = submission.name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const escapedEmail = submission.email
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return {
    subject: `New portfolio contact from ${submission.name}`,
    text: [
      "New portfolio contact form submission",
      "",
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      submission.ipAddress ? `IP: ${submission.ipAddress}` : null,
      submission.userAgent ? `User-Agent: ${submission.userAgent}` : null,
      "",
      "Message:",
      submission.message
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin:0 0 16px">New portfolio contact form submission</h2>
        <p style="margin:0 0 8px"><strong>Name:</strong> ${escapedName}</p>
        <p style="margin:0 0 8px"><strong>Email:</strong> ${escapedEmail}</p>
        ${
          submission.ipAddress
            ? `<p style="margin:0 0 8px"><strong>IP:</strong> ${submission.ipAddress}</p>`
            : ""
        }
        ${
          submission.userAgent
            ? `<p style="margin:0 0 16px"><strong>User-Agent:</strong> ${submission.userAgent}</p>`
            : ""
        }
        <p style="margin:0 0 8px"><strong>Message:</strong></p>
        <div style="padding:16px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc">
          ${escapedMessage}
        </div>
      </div>
    `
  };
}

async function sendContactEmail(submission) {
  const emailConfig = getEmailConfig();
  const transporter = getEmailTransporter();

  if (!emailConfig || !transporter) {
    throw new Error("SMTP is not configured.");
  }

  const emailContent = buildEmailContent(submission);

  await transporter.sendMail({
    from: emailConfig.from,
    to: emailConfig.to,
    replyTo: `${submission.name} <${submission.email}>`,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html
  });
}

async function handleContactRequest(req, res) {
  const body = await parseRequestBody(req);

  const honeypot = sanitizeText(body.website, 200);
  if (honeypot) {
    return res.status(202).json({ message: "Thanks for your message." });
  }

  const submission = {
    name: sanitizeSingleLineText(body.name, 120),
    email: sanitizeSingleLineText(body.email, 160).toLowerCase(),
    message: sanitizeText(body.message, 5000),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req)
  };

  if (!submission.name || !submission.email || !submission.message) {
    return res.status(400).json({
      message: "Name, email, and message are all required."
    });
  }

  if (!isValidEmail(submission.email)) {
    return res.status(400).json({
      message: "Please enter a valid email address."
    });
  }

  const pool = getPool();
  const transporter = getEmailTransporter();

  if (!pool && !transporter) {
    return res.status(503).json({
      message: "Contact service is not configured yet. Add your database or SMTP settings first."
    });
  }

  let submissionId = null;

  if (pool) {
    try {
      submissionId = await saveSubmission(pool, submission);
    } catch (error) {
      console.error("Failed to save contact submission:", error);

      if (!transporter) {
        return res.status(500).json({
          message: getDatabaseFailureMessage(error)
        });
      }
    }
  }

  if (!transporter) {
    return res.status(503).json({
      message: "I saved your message, but inbox delivery is not configured yet. Add SMTP settings to finish setup."
    });
  }

  try {
    await sendContactEmail(submission);
    await updateSubmissionEmailState(pool, submissionId, "SENT", null);

    return res.status(201).json({
      message: pool
        ? "Message sent successfully and delivered to the inbox."
        : "Message sent successfully."
    });
  } catch (error) {
    console.error("Failed to send contact email:", error);

    const deliveryError = sanitizeText(error?.message, 1500) || "Unknown email delivery error.";

    try {
      await updateSubmissionEmailState(pool, submissionId, "FAILED", deliveryError);
    } catch (updateError) {
      console.error("Failed to update contact submission email status:", updateError);
    }

    return res.status(502).json({
      message: getEmailFailureMessage(error)
    });
  }
}

async function closeDatabasePool() {
  if (globalState.__portfolioMailTransporter?.transporter) {
    globalState.__portfolioMailTransporter.transporter.close();
    globalState.__portfolioMailTransporter = null;
  }

  if (!globalState.__portfolioPgPool) {
    return;
  }

  await globalState.__portfolioPgPool.end();
  globalState.__portfolioPgPool = null;
}

module.exports = {
  closeDatabasePool,
  getHealthPayload,
  getMissingEnv,
  handleContactRequest
};
