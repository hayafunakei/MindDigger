"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const promises = require("fs/promises");
const OpenAI = require("openai");
function registerFileHandlers() {
  electron.ipcMain.handle("open-board", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "ボードを開く"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const dirPath = result.filePaths[0];
    return loadBoardFromDirectory(dirPath);
  });
  electron.ipcMain.handle("save-board", async (_, data, filePath) => {
    let dirPath = filePath;
    if (!dirPath) {
      const result = await electron.dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "保存先フォルダを選択"
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      dirPath = result.filePaths[0];
    }
    await saveBoardToDirectory(data, dirPath);
    return dirPath;
  });
  electron.ipcMain.handle("load-board-from-path", async (_, filePath) => {
    return loadBoardFromDirectory(filePath);
  });
  electron.ipcMain.handle("show-save-dialog", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "保存先フォルダを選択"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  electron.ipcMain.handle("show-open-dialog", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "ボードを開く"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}
async function loadBoardFromDirectory(dirPath) {
  try {
    const boardJson = await promises.readFile(path.join(dirPath, "board.json"), "utf-8");
    const nodesJson = await promises.readFile(path.join(dirPath, "nodes.json"), "utf-8");
    let summaries = [];
    try {
      const summariesJson = await promises.readFile(path.join(dirPath, "summaries.json"), "utf-8");
      summaries = JSON.parse(summariesJson);
    } catch {
    }
    return {
      board: JSON.parse(boardJson),
      nodes: JSON.parse(nodesJson),
      summaries
    };
  } catch (error) {
    console.error("Failed to load board:", error);
    return null;
  }
}
async function saveBoardToDirectory(data, dirPath) {
  await promises.mkdir(dirPath, { recursive: true });
  await promises.writeFile(
    path.join(dirPath, "board.json"),
    JSON.stringify(data.board, null, 2),
    "utf-8"
  );
  await promises.writeFile(
    path.join(dirPath, "nodes.json"),
    JSON.stringify(data.nodes, null, 2),
    "utf-8"
  );
  await promises.writeFile(
    path.join(dirPath, "summaries.json"),
    JSON.stringify(data.summaries, null, 2),
    "utf-8"
  );
}
class OpenAIProvider {
  client;
  /**
   * OpenAIProviderを初期化する
   * @param apiKey - OpenAI APIキー
   */
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }
  /**
   * チャットリクエストを送信する
   * @param request - LLMリクエスト
   * @returns LLMレスポンス
   */
  async chat(request) {
    const response = await this.client.chat.completions.create({
      model: request.model || "gpt-4o-mini",
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens
    });
    const choice = response.choices[0];
    const content = choice?.message?.content || "";
    return {
      content,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : void 0
    };
  }
}
const getSettingsPath = () => path.join(electron.app.getPath("userData"), "settings.json");
const defaultSettings = {
  theme: "system"
};
let cachedSettings = null;
function registerSettingsHandlers() {
  electron.ipcMain.handle("get-settings", async () => {
    return getSettings();
  });
  electron.ipcMain.handle("save-settings", async (_, settings) => {
    await saveSettings(settings);
  });
}
async function getSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }
  try {
    const data = await promises.readFile(getSettingsPath(), "utf-8");
    cachedSettings = { ...defaultSettings, ...JSON.parse(data) };
    return cachedSettings;
  } catch {
    cachedSettings = defaultSettings;
    return cachedSettings;
  }
}
async function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  await promises.mkdir(path.dirname(settingsPath), { recursive: true });
  await promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  cachedSettings = settings;
  resetProviders();
}
let openaiProvider = null;
function registerLLMHandlers() {
  electron.ipcMain.handle("send-llm-request", async (_, request) => {
    const settings = await getSettings();
    switch (request.provider) {
      case "openai": {
        if (!settings.openaiApiKey) {
          throw new Error("OpenAI APIキーが設定されていません");
        }
        if (!openaiProvider) {
          openaiProvider = new OpenAIProvider(settings.openaiApiKey);
        }
        return openaiProvider.chat(request);
      }
      case "anthropic":
        throw new Error("Anthropicプロバイダーは未実装です");
      case "google":
        throw new Error("Googleプロバイダーは未実装です");
      case "local":
        throw new Error("Localプロバイダーは未実装です");
      default:
        throw new Error(`未知のプロバイダー: ${request.provider}`);
    }
  });
}
function resetProviders() {
  openaiProvider = null;
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1e3,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.minddigger");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  registerFileHandlers();
  registerLLMHandlers();
  registerSettingsHandlers();
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
