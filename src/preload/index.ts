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

  // ボード管理
  getBoardList: () => ipcRenderer.invoke('get-board-list'),
  selectParentFolder: () => ipcRenderer.invoke('select-parent-folder'),

  // 設定
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // LLM
  sendLLMRequest: (request) => ipcRenderer.invoke('send-llm-request', request),
  generateTopics: (request) => ipcRenderer.invoke('generate-topics', request),
  generateNote: (request) => ipcRenderer.invoke('generate-note', request),
  generateSummary: (request) => ipcRenderer.invoke('generate-summary', request),

  // ダイアログ
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog')
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
