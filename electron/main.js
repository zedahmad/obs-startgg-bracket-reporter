const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");

const DEFAULT_API_URL = "http://127.0.0.1:3001";
const WEB_DEV_URL = "http://127.0.0.1:5173";

function waitForServer(url, retries = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      http
        .get(url, (response) => {
          response.resume();
          resolve();
        })
        .on("error", () => {
          attempts++;

          if (attempts >= retries) {
            reject(new Error("Server did not start"));
          } else {
            setTimeout(check, 200);
          }
        });
    };

    check();
  });
}

function startServer() {
  process.env.IS_PROD = "true";

  const serverPath = path.join(
    process.resourcesPath,
    "app.asar",
    "api",
    "dist",
    "server.js",
  );
  const apiServer = require(serverPath);

  if (!apiServer.serverReady) {
    throw new Error("API server did not expose its startup promise");
  }

  return apiServer.serverReady;
}

function createWindow(apiUrl) {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    autoHideMenuBar: true,
  });

  if (app.isPackaged) {
    win.loadURL(apiUrl);
  } else {
    win.loadURL(WEB_DEV_URL);
  }
}

app.whenReady().then(async () => {
  let apiUrl = DEFAULT_API_URL;

  if (app.isPackaged) {
    const port = await startServer();
    apiUrl = `http://127.0.0.1:${port}`;
  } else {
    await waitForServer(`${apiUrl}/config`);
    await waitForServer(WEB_DEV_URL);
  }

  createWindow(apiUrl);
}).catch((error) => {
  console.error("Failed to launch application:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});
