"use strict";
const electron = require("electron");
const electronAPI = {
  // ファイル操作
  openBoard: () => electron.ipcRenderer.invoke("open-board"),
  saveBoard: (data, filePath) => electron.ipcRenderer.invoke("save-board", data, filePath),
  loadBoardFromPath: (filePath) => electron.ipcRenderer.invoke("load-board-from-path", filePath),
  // 設定
  getSettings: () => electron.ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => electron.ipcRenderer.invoke("save-settings", settings),
  // LLM
  sendLLMRequest: (request) => electron.ipcRenderer.invoke("send-llm-request", request),
  // ダイアログ
  showSaveDialog: () => electron.ipcRenderer.invoke("show-save-dialog"),
  showOpenDialog: () => electron.ipcRenderer.invoke("show-open-dialog")
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
