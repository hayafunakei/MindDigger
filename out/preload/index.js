"use strict";
const electron = require("electron");
const electronAPI = {
  // ファイル操作
  openBoard: () => electron.ipcRenderer.invoke("open-board"),
  saveBoard: (data, filePath) => electron.ipcRenderer.invoke("save-board", data, filePath),
  loadBoardFromPath: (filePath) => electron.ipcRenderer.invoke("load-board-from-path", filePath),
  // ボード管理
  getBoardList: () => electron.ipcRenderer.invoke("get-board-list"),
  selectParentFolder: () => electron.ipcRenderer.invoke("select-parent-folder"),
  // 設定
  getSettings: () => electron.ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => electron.ipcRenderer.invoke("save-settings", settings),
  getAvailableModels: () => electron.ipcRenderer.invoke("get-available-models"),
  // LLM
  sendLLMRequest: (request) => electron.ipcRenderer.invoke("send-llm-request", request),
  generateTopics: (request) => electron.ipcRenderer.invoke("generate-topics", request),
  generateNote: (request) => electron.ipcRenderer.invoke("generate-note", request),
  generateSummary: (request) => electron.ipcRenderer.invoke("generate-summary", request),
  // ダイアログ
  showSaveDialog: () => electron.ipcRenderer.invoke("show-save-dialog"),
  showOpenDialog: () => electron.ipcRenderer.invoke("show-open-dialog")
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
