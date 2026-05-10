const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1700,
    height: 1000,
    minWidth: 1500,
    minHeight: 900,
    autoHideMenuBar: false,
  });

  win.loadFile(path.join(__dirname, "dist/index.html"));

  win.webContents.setZoomFactor(0.85);
  win.maximize();
}

app.whenReady().then(createWindow);