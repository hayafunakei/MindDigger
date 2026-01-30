"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const promises = require("fs/promises");
const yaml = require("js-yaml");
const OpenAI = require("openai");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const yaml__namespace = /* @__PURE__ */ _interopNamespaceDefault(yaml);
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
      model: request.model || "gpt-5-mini",
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
  /**
   * トピックを生成する
   * @param request - トピック生成リクエスト
   * @returns 生成されたトピック配列
   */
  async generateTopics(request) {
    const maxTopics = request.maxTopics || 5;
    const systemPrompt = `あなたは思考整理の専門家です。与えられた内容から、さらに深掘りすべき論点や検討事項を抽出してください。
各トピックは以下のJSON形式で出力してください：
{
  "title": "論点のタイトル（簡潔に）",
  "description": "論点の説明（省略可）",
  "importance": 1-5の重要度,
  "tags": ["タグ1", "タグ2"]
}

最大${maxTopics}個のトピックを配列形式で返してください。`;
    const userPrompt = request.context ? `以下の文脈を踏まえて：
${request.context}

次の内容から論点を抽出：
${request.content}` : `次の内容から論点を抽出：
${request.content}`;
    const response = await this.client.chat.completions.create({
      model: request.model || "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });
    const content = response.choices[0]?.message?.content || '{"topics": []}';
    try {
      const parsed = JSON.parse(content);
      return parsed.topics || [];
    } catch {
      return [];
    }
  }
  /**
   * ノートの下書きを生成する
   * @param request - ノート生成リクエスト
   * @returns 生成されたノートの内容
   */
  async generateNote(request) {
    const systemPrompt = `あなたは思考整理の専門家です。与えられた内容から、決定事項や重要なポイントをまとめたメモを作成してください。
簡潔で分かりやすい箇条書き形式を推奨します。`;
    const userPrompt = request.context ? `以下の文脈を踏まえて：
${request.context}

次の内容をまとめてください：
${request.content}` : `次の内容をまとめてください：
${request.content}`;
    const response = await this.client.chat.completions.create({
      model: request.model || "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7
    });
    return response.choices[0]?.message?.content || "";
  }
  /**
   * サマリーを生成する
   * @param request - サマリー生成リクエスト
   * @returns 生成されたサマリー
   */
  async generateSummary(request) {
    const scoredNodes = request.nodes.map((node) => {
      let score = (node.importance || 3) * 10;
      if (node.pin) score += 100;
      if (node.type === "note") score += 10;
      if (node.type === "topic") score += 5;
      return { node, score };
    }).sort((a, b) => b.score - a.score);
    const topNodes = scoredNodes.slice(0, 20).map((s) => s.node);
    const systemPrompt = `あなたは思考整理の専門家です。与えられたノード情報から、以下の観点で要約を作成してください：

1. **重要な論点**: 検討されている主要なテーマ
2. **決定事項**: 📌ピン留めされたノードから抽出（ピン留め = 確定・決定を意味する）
3. **メモ・検討内容**: noteノードの内容を要約
4. **未解決の課題**: topicノードから抽出
5. **次のアクション**: 今後検討すべき事項

各セクションは該当する情報がある場合のみ出力してください。
簡潔で分かりやすいMarkdown形式で出力してください。
重要: \`\`\`markdown などのコードブロックで囲まないでください。直接Markdownを出力してください。`;
    const nodesInfo = topNodes.map((node) => {
      const metadata = [];
      if (node.pin) metadata.push("📌ピン留め");
      if (node.importance && node.importance >= 4) metadata.push(`重要度:${node.importance}`);
      if (node.tags && node.tags.length > 0) metadata.push(`タグ:${node.tags.join(",")}`);
      return `## [${node.type}] ${node.title || "無題"}
${metadata.length > 0 ? `**メタ情報**: ${metadata.join(" / ")}
` : ""}
**内容**: ${node.content.substring(0, 300)}${node.content.length > 300 ? "..." : ""}
`;
    }).join("\n---\n\n");
    const scopeDescription = request.scope === "board" ? "ボード全体" : "選択されたノード配下";
    const userPrompt = `${scopeDescription}の情報から要約を作成してください：

${nodesInfo}`;
    console.group("📋 [Main] Summary LLM Request");
    console.log("Scope:", request.scope);
    console.log("Original Nodes Count:", request.nodes.length);
    console.log("Top Nodes Count (after scoring):", topNodes.length);
    console.log("--- System Prompt ---");
    console.log(systemPrompt);
    console.log("--- User Prompt ---");
    console.log(userPrompt);
    console.groupEnd();
    const response = await this.client.chat.completions.create({
      model: request.model || "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2e3
    });
    let content = response.choices[0]?.message?.content || "";
    content = content.replace(/^```(?:markdown)?\n?/i, "").replace(/\n?```$/i, "");
    return content;
  }
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
  electron.ipcMain.handle("generate-topics", async (_, request) => {
    const settings = await getSettings();
    if (!settings.openaiApiKey) {
      throw new Error("OpenAI APIキーが設定されていません");
    }
    if (!openaiProvider) {
      openaiProvider = new OpenAIProvider(settings.openaiApiKey);
    }
    return openaiProvider.generateTopics(request);
  });
  electron.ipcMain.handle("generate-note", async (_, request) => {
    const settings = await getSettings();
    if (!settings.openaiApiKey) {
      throw new Error("OpenAI APIキーが設定されていません");
    }
    if (!openaiProvider) {
      openaiProvider = new OpenAIProvider(settings.openaiApiKey);
    }
    return openaiProvider.generateNote(request);
  });
  electron.ipcMain.handle("generate-summary", async (_, request) => {
    const settings = await getSettings();
    if (!settings.openaiApiKey) {
      throw new Error("OpenAI APIキーが設定されていません");
    }
    if (!openaiProvider) {
      openaiProvider = new OpenAIProvider(settings.openaiApiKey);
    }
    return openaiProvider.generateSummary(request);
  });
}
function resetProviders() {
  openaiProvider = null;
}
const getSettingsPath = () => path.join(electron.app.getPath("userData"), "settings.json");
const getModelsConfigPath = () => {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "config", "models.yaml");
  }
  return path.join(electron.app.getAppPath(), "resources", "config", "models.yaml");
};
const defaultSettings = {
  theme: "system",
  defaultProvider: "openai",
  defaultModel: "gpt-5-mini",
  topicGenerationModel: "gpt-5-mini"
};
let cachedModelsConfig = null;
let cachedSettings = null;
async function loadModelsConfig() {
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }
  try {
    const configPath = getModelsConfigPath();
    const content = await promises.readFile(configPath, "utf-8");
    cachedModelsConfig = yaml__namespace.load(content);
    return cachedModelsConfig;
  } catch (error) {
    console.error("Failed to load models config:", error);
    return {
      providers: {
        openai: {
          name: "OpenAI",
          enabled: true,
          models: [
            { id: "gpt-5-mini", name: "GPT-5 Mini", description: "高速でコスト効率の良いモデル", isDefault: true }
          ]
        },
        anthropic: { name: "Anthropic", enabled: false, models: [] },
        google: { name: "Google", enabled: false, models: [] },
        local: { name: "Local", enabled: false, models: [] }
      }
    };
  }
}
function registerSettingsHandlers() {
  electron.ipcMain.handle("get-settings", async () => {
    return getSettings();
  });
  electron.ipcMain.handle("save-settings", async (_, settings) => {
    await saveSettings(settings);
  });
  electron.ipcMain.handle("get-available-models", async () => {
    const config = await loadModelsConfig();
    return {
      providers: config.providers
    };
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
function registerFileHandlers() {
  electron.ipcMain.handle("get-board-list", async () => {
    const settings = await getSettings();
    if (!settings.parentFolderPath) {
      return [];
    }
    return getBoardListFromFolder(settings.parentFolderPath);
  });
  electron.ipcMain.handle("select-parent-folder", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "ボード管理用の親フォルダを選択"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const folderPath = result.filePaths[0];
    const settings = await getSettings();
    await saveSettings({ ...settings, parentFolderPath: folderPath });
    return folderPath;
  });
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
      const settings = await getSettings();
      if (settings.parentFolderPath) {
        const sanitizedTitle = data.board.title.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_").substring(0, 50);
        dirPath = path.join(settings.parentFolderPath, `${sanitizedTitle}_${Date.now()}`);
      } else {
        const result = await electron.dialog.showOpenDialog({
          properties: ["openDirectory", "createDirectory"],
          title: "保存先フォルダを選択"
        });
        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }
        dirPath = result.filePaths[0];
      }
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
async function getBoardListFromFolder(parentPath) {
  const boardList = [];
  try {
    const entries = await promises.readdir(parentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(parentPath, entry.name);
      const boardJsonPath = path.join(folderPath, "board.json");
      try {
        const boardJson = await promises.readFile(boardJsonPath, "utf-8");
        const board = JSON.parse(boardJson);
        boardList.push({
          id: board.id,
          title: board.title,
          description: board.description,
          folderPath,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt
        });
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error("Failed to get board list:", error);
  }
  return boardList.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
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
    if (utils.is.dev) {
      mainWindow.webContents.openDevTools();
    }
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
