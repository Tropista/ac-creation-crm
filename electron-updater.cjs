const { autoUpdater } = require("electron-updater");
const { ipcMain } = require("electron");
const { stopBankServer } = require("./electron-bank.cjs");

let mainWindow = null;
let ipcRegistered = false;

function notifyRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function registerIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("updater:restart", () => {
    stopBankServer();
    autoUpdater.quitAndInstall(true, true);
  });
}

function isSkippableUpdateError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("net::") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("404") ||
    message.includes("no published versions") ||
    message.includes("app-update.yml") ||
    message.includes("cannot find latest")
  );
}

function setupAutoUpdater(win, { isPackaged }) {
  if (!isPackaged) return;

  mainWindow = win;
  registerIpcHandlers();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    console.log("[autoUpdater] Vérification des mises à jour…");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[autoUpdater] Mise à jour disponible :", info.version);
    notifyRenderer("update-available", { version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[autoUpdater] Application à jour.");
  });

  autoUpdater.on("download-progress", (progress) => {
    notifyRenderer("update-download-progress", {
      percent: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[autoUpdater] Mise à jour téléchargée :", info.version);
    notifyRenderer("update-downloaded", { version: info.version });
  });

  autoUpdater.on("error", (error) => {
    if (isSkippableUpdateError(error)) {
      console.warn("[autoUpdater] Mise à jour ignorée :", error.message);
      return;
    }
    console.error("[autoUpdater] Erreur :", error.message);
    notifyRenderer("update-error", { message: error.message });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      if (isSkippableUpdateError(error)) {
        console.warn("[autoUpdater] Vérification ignorée :", error.message);
        return;
      }
      console.error("[autoUpdater] Vérification impossible :", error.message);
    });
  }, 5000);
}

module.exports = { setupAutoUpdater };
