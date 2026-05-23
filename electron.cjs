const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const {
  getBankApiUrl,
  startBankServer,
  stopBankServer,
} = require("./electron-bank.cjs");
const { setupAutoUpdater } = require("./electron-updater.cjs");

const isDev = !app.isPackaged;
const appRoot = __dirname;

function resolveIconPath() {
  const candidates = [
    path.join(appRoot, "public", "icon.ico"),
    path.join(appRoot, "dist", "icon.ico"),
  ];
  for (const iconPath of candidates) {
    if (fs.existsSync(iconPath)) return iconPath;
  }
  return null;
}

function createWindow() {
  const iconPath = resolveIconPath();
  const window = new BrowserWindow({
    width: 1700,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    autoHideMenuBar: false,
    title: "AC Creation CRM",
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(appRoot, "electron-preload.cjs"),
      additionalArguments: [`--bank-api-url=${getBankApiUrl()}`],
    },
  });

  const indexPath = path.join(appRoot, "dist", "index.html");
  if (!fs.existsSync(indexPath)) {
    const message = [
      "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\">",
      "<title>AC Creation CRM</title>",
      "<style>body{font-family:Segoe UI,sans-serif;background:#081b4b;color:#e2e8f0;padding:2rem;line-height:1.6}",
      "code{background:#1e293b;padding:.15rem .4rem;border-radius:4px}",
      "ol{margin-top:1rem}</style></head><body>",
      "<h1>Build manquant</h1>",
      "<p>Le dossier <code>dist/</code> est absent. Pour l’atelier :</p>",
      "<ol>",
      "<li>Copier <code>.env.example</code> vers <code>.env</code></li>",
      "<li>Renseigner <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code></li>",
      "<li>Lancer <code>npm run build</code> puis <code>npm run electron</code> ou <code>npm run dist</code></li>",
      "</ol>",
      "<p><small>Les variables <code>VITE_*</code> sont intégrées au build Vite, pas au lancement Electron.</small></p>",
      "</body></html>",
    ].join("");
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(message)}`);
    return window;
  }

  window.loadFile(indexPath);
  window.webContents.setZoomFactor(0.85);
  window.maximize();

  if (isDev && process.env.ELECTRON_DEVTOOLS === "1") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}

app.whenReady().then(async () => {
  await startBankServer({
    appRoot,
    userDataPath: app.getPath("userData"),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
  });

  const mainWindow = createWindow();
  setupAutoUpdater(mainWindow, { isPackaged: app.isPackaged });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      setupAutoUpdater(win, { isPackaged: app.isPackaged });
    }
  });
});

app.on("before-quit", () => {
  stopBankServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
