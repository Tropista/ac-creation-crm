import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import axios from "axios";
import nodemailer from "nodemailer";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFiles() {
  const candidates = [
    process.env.BANK_ENV_PATH,
    path.join(__dirname, "..", ".env"),
  ].filter(Boolean);

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return envPath;
    }
  }

  return null;
}

loadEnvFiles();


function pidsOnPort(port) {
  if (process.platform !== "win32") return [];
  try {
    const output = execSync(
      `netstat -ano | findstr ":${port}" | findstr LISTENING`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const pids = new Set();
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0") pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.BANK_HOST || "127.0.0.1";
const TINK_CLIENT_ID = process.env.TINK_CLIENT_ID || "";
const TINK_CLIENT_SECRET = process.env.TINK_CLIENT_SECRET || "";
const TINK_REDIRECT_URI =
  process.env.TINK_REDIRECT_URI || `http://${HOST}:${PORT}/api/bank/callback`;
const TINK_MARKET = process.env.TINK_MARKET || "LU";
const TINK_LOCALE = process.env.TINK_LOCALE || "fr_FR";

const TOKEN_STORE_PATH =
  process.env.TINK_TOKEN_STORE_PATH ||
  path.join(__dirname, ".tink-token.json");

function readTokenStore() {
  try {
    if (!fs.existsSync(TOKEN_STORE_PATH)) return null;
    return JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeTokenStore(payload) {
  fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

function clearTokenStore() {
  if (fs.existsSync(TOKEN_STORE_PATH)) {
    fs.unlinkSync(TOKEN_STORE_PATH);
  }
}

function tinkConfigured() {
  return Boolean(TINK_CLIENT_ID);
}

function oauthConfigured() {
  return Boolean(TINK_CLIENT_ID && TINK_CLIENT_SECRET);
}

async function exchangeAuthorizationCode(code) {
  const params = new URLSearchParams({
    client_id: TINK_CLIENT_ID,
    client_secret: TINK_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: TINK_REDIRECT_URI,
  });

  const { data } = await axios.post(
    "https://api.tink.com/api/v1/oauth/token",
    params.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  writeTokenStore({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    scope: data.scope,
    connectedAt: new Date().toISOString(),
  });

  return data;
}

async function getValidAccessToken() {
  const store = readTokenStore();
  if (!store?.accessToken) return null;
  if (store.expiresAt && store.expiresAt > Date.now() + 60_000) {
    return store.accessToken;
  }

  if (!store.refreshToken || !oauthConfigured()) {
    return store.accessToken;
  }

  const params = new URLSearchParams({
    client_id: TINK_CLIENT_ID,
    client_secret: TINK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: store.refreshToken,
  });

  const { data } = await axios.post(
    "https://api.tink.com/api/v1/oauth/token",
    params.toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );

  writeTokenStore({
    ...store,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || store.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}

function mapTinkTransaction(tx) {
  const amount = Number(tx.amount?.value?.unscaledValue || 0) /
    Math.pow(10, Number(tx.amount?.value?.scale || 0));

  return {
    transaction_date: tx.dates?.booked || tx.dates?.value || new Date().toISOString().slice(0, 10),
    description: tx.descriptions?.display || tx.descriptions?.original || "Transaction Tink",
    amount,
    currency: tx.amount?.currencyCode || "EUR",
    status: "non rapprochée",
    matched: false,
    external_id: tx.id,
    provider: "Tink",
  };
}

app.get("/api/bank/status", (req, res) => {
  const store = readTokenStore();
  res.json({
    ok: true,
    provider: "Tink",
    configured: tinkConfigured(),
    oauthReady: oauthConfigured(),
    connected: Boolean(store?.accessToken),
    connectedAt: store?.connectedAt || null,
    redirectUri: TINK_REDIRECT_URI,
    manualFallback: !oauthConfigured(),
    message: !tinkConfigured()
      ? "TINK_CLIENT_ID manquant — utilisez la saisie manuelle dans le CRM."
      : oauthConfigured()
        ? store?.accessToken
          ? "Connexion Tink active."
          : "Cliquez sur Connecter pour lier votre banque."
        : "OAuth incomplet — ajoutez TINK_CLIENT_SECRET ou utilisez la saisie manuelle.",
  });
});

app.get("/api/bank/link", (req, res) => {
  if (!tinkConfigured()) {
    return res.status(503).json({
      error: "TINK_CLIENT_ID non configuré",
      manualFallback: true,
    });
  }

  const url =
    `https://link.tink.com/1.0/transactions/connect-accounts` +
    `?client_id=${encodeURIComponent(TINK_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(TINK_REDIRECT_URI)}` +
    `&market=${encodeURIComponent(TINK_MARKET)}` +
    `&locale=${encodeURIComponent(TINK_LOCALE)}`;

  res.json({ url, redirectUri: TINK_REDIRECT_URI });
});

app.get("/api/bank/callback", async (req, res) => {
  const { code, error, error_description: errorDescription } = req.query;

  if (error) {
    return res
      .status(400)
      .send(`Connexion Tink annulée : ${errorDescription || error}`);
  }

  if (!code) {
    return res.status(400).send("Code OAuth manquant.");
  }

  if (!oauthConfigured()) {
    return res
      .status(503)
      .send(
        "Code reçu, mais TINK_CLIENT_SECRET est absent. Ajoutez-le dans .env puis reconnectez."
      );
  }

  try {
    await exchangeAuthorizationCode(code);
    res.send(
      "<html><body style='font-family:sans-serif;padding:24px'><h1>Banque connectée</h1><p>Vous pouvez fermer cette fenêtre et revenir au CRM.</p></body></html>"
    );
  } catch (err) {
    console.error(err);
    res.status(500).send(`Erreur OAuth Tink : ${err.message}`);
  }
});

app.post("/api/bank/disconnect", (req, res) => {
  clearTokenStore();
  res.json({ ok: true });
});

app.get("/api/bank/transactions", async (req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return res.status(401).json({
      error: "Banque non connectée",
      manualFallback: true,
    });
  }

  try {
    const { data } = await axios.get(
      "https://api.tink.com/data/v2/transactions",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          pageSize: Number(req.query.limit || 50),
        },
      }
    );

    const transactions = (data.transactions || []).map(mapTinkTransaction);
    res.json({ transactions, provider: "Tink" });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: err.response?.data?.message || err.message,
      manualFallback: true,
    });
  }
});

app.post("/send-email", async (req, res) => {
  const { to, subject, text, html, attachmentBase64, attachmentName, smtpEmail, smtpAppPassword, fromName } = req.body || {};

  if (!to || !subject || !smtpEmail || !smtpAppPassword) {
    return res.status(400).json({ error: "Paramètres manquants (to, subject, smtpEmail, smtpAppPassword)." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: smtpEmail, pass: smtpAppPassword },
    });

    const mailOptions = {
      from: fromName ? `"${fromName}" <${smtpEmail}>` : smtpEmail,
      to,
      subject,
      text: text || "",
      html: html || (text || "").replace(/\n/g, "<br>"),
      ...(attachmentBase64 ? {
        attachments: [{
          filename: attachmentName || "document.pdf",
          content: attachmentBase64,
          encoding: "base64",
          contentType: "application/pdf",
        }],
      } : {}),
    };

    await transporter.sendMail(mailOptions);
    res.json({ ok: true });
  } catch (err) {
    console.error("[send-email]", err.message);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`CRM API OK sur http://${HOST}:${PORT}`);
  if (!tinkConfigured()) {
    console.warn("TINK_CLIENT_ID absent — mode saisie manuelle uniquement.");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    const pids = pidsOnPort(PORT);
    const pidHint = pids.length
      ? ` PID(s) : ${pids.join(", ")}. Exemple : taskkill /PID ${pids[0]} /F — ou npm run bank:win`
      : ` Verifiez : netstat -ano | findstr :${PORT}`;
    console.error(`Port ${PORT} deja utilise sur ${HOST}.${pidHint}`);
    console.error(
      "Si un autre terminal affiche deja CRM API OK, ce serveur tourne : inutile de relancer npm run bank."
    );
    process.exit(1);
  }
  throw error;
});
