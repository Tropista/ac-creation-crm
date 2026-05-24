const { spawn, execSync } = require("child_process");

const fs = require("fs");

const path = require("path");

const dotenv = require("dotenv");



const DEFAULT_BANK_PORT = 3001;

const DEFAULT_BANK_HOST = "127.0.0.1";

const REQUIRED_CATALOG_PARSER_VERSION = 4;



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



function sleep(ms) {

  return new Promise((resolve) => setTimeout(resolve, ms));

}



function killProcessOnPort(port) {

  if (process.platform === "win32") {

    try {

      const output = execSync(`netstat -ano | findstr ":${port}" | findstr LISTENING`, {

        encoding: "utf8",

        stdio: ["ignore", "pipe", "ignore"],

      });

      const pids = new Set();

      for (const line of output.split(/\r?\n/)) {

        const trimmed = line.trim();

        if (!trimmed) continue;

        const parts = trimmed.split(/\s+/);

        const pid = parts[parts.length - 1];

        if (pid && pid !== "0") pids.add(pid);

      }

      for (const pid of pids) {

        try {

          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });

        } catch {

          // Process may already be gone.

        }

      }

      return pids.size;

    } catch {

      return 0;

    }

  }



  try {

    execSync(`lsof -ti tcp:${port} | xargs kill -9`, { stdio: "ignore" });

    return 1;

  } catch {

    return 0;

  }

}



async function probeBankServer(url) {

  try {

    const [bankResponse, catalogResponse] = await Promise.all([

      fetch(`${url}/api/bank/status`),

      fetch(`${url}/api/catalog/health`),

    ]);



    if (!bankResponse.ok) {

      return { running: false, parserVersion: 0, catalogReady: false };

    }



    if (!catalogResponse.ok) {

      return { running: true, parserVersion: 0, catalogReady: false };

    }



    let parserVersion = 0;

    try {

      const catalogPayload = await catalogResponse.json();

      parserVersion = Number(catalogPayload?.parserVersion) || 0;

    } catch {

      parserVersion = 0;

    }



    return {

      running: true,

      parserVersion,

      catalogReady: true,

    };

  } catch {

    return { running: false, parserVersion: 0, catalogReady: false };

  }

}



async function waitForBankServer(url, attempts = 40, delayMs = 250) {

  for (let attempt = 0; attempt < attempts; attempt += 1) {

    const probe = await probeBankServer(url);

    if (

      probe.running &&

      probe.catalogReady &&

      probe.parserVersion >= REQUIRED_CATALOG_PARSER_VERSION

    ) {

      return probe;

    }

    await sleep(delayMs);

  }

  return probeBankServer(url);

}



async function startBankServer({ appRoot, userDataPath, execPath, isPackaged }) {

  loadBankEnv(appRoot, userDataPath);



  const port = getBankPort();

  const host = process.env.BANK_HOST || DEFAULT_BANK_HOST;

  bankApiUrl = `http://${host}:${port}`;



  const initialProbe = await probeBankServer(bankApiUrl);



  if (

    initialProbe.running &&

    initialProbe.catalogReady &&

    initialProbe.parserVersion >= REQUIRED_CATALOG_PARSER_VERSION &&

    !bankProcess

  ) {

    console.log(

      `Bank API déjà active sur ${bankApiUrl} (parseur catalogue v${initialProbe.parserVersion}).`

    );

    return bankApiUrl;

  }



  if (initialProbe.running) {

    const reason =

      initialProbe.parserVersion > 0 && initialProbe.parserVersion < REQUIRED_CATALOG_PARSER_VERSION

        ? `parseur catalogue obsolète (v${initialProbe.parserVersion} < v${REQUIRED_CATALOG_PARSER_VERSION})`

        : "routes catalogue manquantes ou serveur incompatible";

    console.warn(`Arrêt du serveur sur le port ${port} (${reason})…`);

    killProcessOnPort(port);

    await sleep(500);

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

  if (

    !ready.running ||

    !ready.catalogReady ||

    ready.parserVersion < REQUIRED_CATALOG_PARSER_VERSION

  ) {

    console.warn(

      `Bank API indisponible ou parseur obsolète sur ${bankApiUrl} (v${ready.parserVersion || "?"}).`

    );

  } else {

    console.log(`Bank API prête sur ${bankApiUrl} (parseur catalogue v${ready.parserVersion}).`);

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

  REQUIRED_CATALOG_PARSER_VERSION,

};

