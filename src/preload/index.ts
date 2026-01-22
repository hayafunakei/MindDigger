/**
 * Preloadスクリプト
 * メインプロセスとレンダラープロセス間のブリッジ
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '@shared/ipc';

const electronAPI: ElectronAPI = {
  // ファイル操作
  openBoard: () => ipcRenderer.invoke('open-board'),
  saveBoard: (data, filePath) => ipcRenderer.invoke('save-board', data, filePath),
  loadBoardFromPath: (filePath) => ipcRenderer.invoke('load-board-from-path', filePath),

  // 設定
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // LLM
  sendLLMRequest: (request) => ipcRenderer.invoke('send-llm-request', request),

  // ダイアログ
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog')
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
