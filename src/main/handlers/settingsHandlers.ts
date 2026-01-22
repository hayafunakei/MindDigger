/**
 * アプリ設定のIPCハンドラ
 */
import { ipcMain, app } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { AppSettings } from '@shared/ipc';
import { resetProviders } from './llmHandlers';

/** 設定ファイルのパス */
const getSettingsPath = () => join(app.getPath('userData'), 'settings.json');

/** デフォルト設定 */
const defaultSettings: AppSettings = {
  theme: 'system'
};

/** 設定のキャッシュ */
let cachedSettings: AppSettings | null = null;

/**
 * 設定関連のIPCハンドラを登録する
 */
export function registerSettingsHandlers(): void {
  ipcMain.handle('get-settings', async (): Promise<AppSettings> => {
    return getSettings();
  });

  ipcMain.handle('save-settings', async (_, settings: AppSettings): Promise<void> => {
    await saveSettings(settings);
  });
}

/**
 * 設定を取得する
 */
export async function getSettings(): Promise<AppSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const data = await readFile(getSettingsPath(), 'utf-8');
    cachedSettings = { ...defaultSettings, ...JSON.parse(data) };
    return cachedSettings;
  } catch {
    // 設定ファイルがなければデフォルトを返す
    cachedSettings = defaultSettings;
    return cachedSettings;
  }
}

/**
 * 設定を保存する
 */
async function saveSettings(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  cachedSettings = settings;
  
  // APIキーが変更された可能性があるのでプロバイダーをリセット
  resetProviders();
}
