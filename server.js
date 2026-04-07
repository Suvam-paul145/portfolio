require("dotenv").config();

const express = require("express");
const path = require("path");
const {
  disconnectPrisma,
  getHealthPayload,
  getMissingEnv,
  handleContactRequest,
  verifyServices
} = require("./lib/contact-service");

const app = express();
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const port = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", async (_req, res) => {
  const payload = await getHealthPayload();
  res.json(payload);
});

app.post("/api/contact", handleContactRequest);

app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

async function bootstrap() {
  const { missingRuntimeEnv, missingSetupEnv } = getMissingEnv();

  if (missingRuntimeEnv.length || missingSetupEnv.length) {
    console.warn(
      "Missing environment values:",
      [...missingRuntimeEnv, ...missingSetupEnv].join(", ")
    );
  }

  await verifyServices();

  app.listen(port, () => {
    console.log(`Portfolio server running at http://localhost:${port}`);
  });
}

bootstrap();

async function shutdown() {
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
