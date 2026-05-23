const { contextBridge, ipcRenderer } = require("electron");

const bankArg = process.argv.find((arg) => arg.startsWith("--bank-api-url="));
const bankApiUrl = bankArg
  ? bankArg.slice("--bank-api-url=".length)
  : "http://127.0.0.1:3001";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  getBankApiUrl: () => bankApiUrl,
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },
  onUpdateDownloadProgress: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on("update-download-progress", handler);
    return () => ipcRenderer.removeListener("update-download-progress", handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },
  restartToUpdate: () => ipcRenderer.invoke("updater:restart"),
});
