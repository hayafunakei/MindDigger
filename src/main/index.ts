/**
 * Electronメインプロセス
 */
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { registerFileHandlers } from './handlers/fileHandlers';
import { registerLLMHandlers } from './handlers/llmHandlers';
import { registerSettingsHandlers } from './handlers/settingsHandlers';

/**
 * メインウィンドウを作成する
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // 開発環境ではlocalhostを、本番ではビルドされたHTMLを読み込む
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Electronの準備完了時
app.whenReady().then(() => {
  // アプリIDを設定
  electronApp.setAppUserModelId('com.minddigger');

  // 開発時のF12でDevToolsを開く
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPCハンドラを登録
  registerFileHandlers();
  registerLLMHandlers();
  registerSettingsHandlers();

  createWindow();

  app.on('activate', function () {
    // macOSでDockアイコンクリック時にウィンドウがなければ作成
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 全ウィンドウが閉じられたとき（macOS以外はアプリ終了）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
