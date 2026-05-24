const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const DEFAULT_BANK_PORT = 3001;
const DEFAULT_BANK_HOST = "127.0.0.1";

let bankProcess = null;
let bankApiUrl = `http://${DEFAULT_BANK_HOST}:${DEFAULT_BANK_PORT}`;

function resolveEnvPaths(appRoot, userDataPath) {
  return [
    path.join(appRoot, ".env"),
    path.join(userDataPath, ".env"),
  ];
}

function loadBankEnv(appRoot, userDataPath) {
  for (const envPath of resolveEnvPaths(appRoot, userDataPath)) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return envPath;
    }
  }
  return null;
}

function getBankPort() {
  const port = Number(process.env.PORT || DEFAULT_BANK_PORT);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_BANK_PORT;
}

function getBankApiUrl() {
  return bankApiUrl;
}

async function waitForBankServer(url, attempts = 40, delayMs = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const [bankResponse, catalogResponse] = await Promise.all([
        fetch(`${url}/api/bank/status`),
        fetch(`${url}/api/catalog/health`),
      ]);
      if (bankResponse.ok && catalogResponse.ok) return true;
      if (bankResponse.ok && catalogResponse.status === 404) {
        console.warn(
          `Bank API active on ${url} but catalog routes are missing — restart the backend.`
        );
        return true;
      }
    } catch {
      // Server still starting or already running elsewhere.
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function startBankServer({ appRoot, userDataPath, execPath, isPackaged }) {
  loadBankEnv(appRoot, userDataPath);

  const port = getBankPort();
  const host = process.env.BANK_HOST || DEFAULT_BANK_HOST;
  bankApiUrl = `http://${host}:${port}`;

  const alreadyRunning = await waitForBankServer(bankApiUrl, 3, 100);
  if (alreadyRunning && !bankProcess) {
    return bankApiUrl;
  }

  const serverPath = path.join(appRoot, "backend", "server.js");
  if (!fs.existsSync(serverPath)) {
    console.warn(`Bank server introuvable : ${serverPath}`);
    return bankApiUrl;
  }

  const tokenStorePath = path.join(userDataPath, ".tink-token.json");
  fs.mkdirSync(userDataPath, { recursive: true });

  bankProcess = spawn(execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      BANK_HOST: host,
      TINK_TOKEN_STORE_PATH: tokenStorePath,
    },
    cwd: appRoot,
    stdio: isPackaged ? "ignore" : "inherit",
    windowsHide: true,
  });

  bankProcess.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
      console.warn(`Bank server arrêté (code=${code}, signal=${signal || "none"})`);
    }
    bankProcess = null;
  });

  bankProcess.on("error", (error) => {
    console.error("Impossible de démarrer le serveur banque :", error);
    bankProcess = null;
  });

  const ready = await waitForBankServer(bankApiUrl);
  if (!ready) {
    console.warn(`Bank API indisponible sur ${bankApiUrl}`);
  }

  return bankApiUrl;
}

function stopBankServer() {
  if (!bankProcess || bankProcess.killed) return;
  bankProcess.kill();
  bankProcess = null;
}

module.exports = {
  getBankApiUrl,
  startBankServer,
  stopBankServer,
};
