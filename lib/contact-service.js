const { Pool } = require("pg");

const runtimeEnvKeys = ["DATABASE_URL_OR_DIRECT_URL"];
const setupEnvKeys = [];

const globalForDatabase = globalThis;

function getMissingEnv() {
  const hasConnectionConfig = !!getResolvedDatabaseConfig();

  return {
    missingRuntimeEnv: hasConnectionConfig ? [] : runtimeEnvKeys,
    missingSetupEnv: setupEnvKeys.filter((key) => !process.env[key])
  };
}

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .replace(/\r\n/g, "\n")
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  if (!globalForDatabase.__portfolioPgPool) {
    const pool = new Pool(getPoolConfig());
    pool.on("error", (error) => {
      console.error("Unexpected Postgres pool error:", error.message);
    });
    globalForDatabase.__portfolioPgPool = pool;
  }

  return globalForDatabase.__portfolioPgPool;
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

async function getHealthPayload() {
  const { missingRuntimeEnv, missingSetupEnv } = getMissingEnv();
  const pool = getPool();

  let database = "not_configured";
  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "ok";
    } catch (_error) {
      database = "error";
    }
  }

  return {
    ok: database === "ok",
    database,
    email: "disabled",
    missingRuntimeEnv,
    missingSetupEnv
  };
}

async function handleContactRequest(req, res) {
  const { missingRuntimeEnv } = getMissingEnv();
  const body = await parseRequestBody(req);

  const honeypot = sanitizeText(body.website, 200);
  if (honeypot) {
    return res.status(202).json({ message: "Thanks for your message." });
  }

  if (missingRuntimeEnv.length) {
    return res.status(503).json({
      message: "Contact service is not configured yet. Please add a valid DATABASE_URL or DIRECT_URL first."
    });
  }

  const name = sanitizeText(body.name, 120);
  const email = sanitizeText(body.email, 160).toLowerCase();
  const message = sanitizeText(body.message, 5000);

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
  const userAgent = getUserAgent(req);
  const pool = getPool();

  try {
    await pool.query(
      `
        INSERT INTO contact_submissions ("name", "email", "message", "ipAddress", "userAgent")
        VALUES ($1, $2, $3, $4, $5)
      `,
      [name, email, message, ipAddress, userAgent]
    );

    return res.status(201).json({
      message: "Message saved successfully. I'll get back to you soon."
    });
  } catch (error) {
    console.error("Failed to save contact submission:", error);
    return res.status(500).json({
      message: getDatabaseFailureMessage(error)
    });
  }
}

async function closeDatabasePool() {
  if (!globalForDatabase.__portfolioPgPool) {
    return;
  }

  await globalForDatabase.__portfolioPgPool.end();
  globalForDatabase.__portfolioPgPool = null;
}

module.exports = {
  closeDatabasePool,
  getHealthPayload,
  getMissingEnv,
  handleContactRequest
};
