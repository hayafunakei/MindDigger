/**
 * アプリ設定のIPCハンドラ
 */
import { ipcMain, app } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import * as yaml from 'js-yaml';
import type { AppSettings, AvailableModelsResponse } from '@shared/ipc';
import type { ModelsConfigFile, Provider } from '@shared/types';
import { resetProviders } from './llmHandlers';

/** 設定ファイルのパス */
const getSettingsPath = () => join(app.getPath('userData'), 'settings.json');

/** モデル設定ファイルのパス */
const getModelsConfigPath = () => {
  // 開発時はプロジェクトルート、本番時はresourcesフォルダ
  if (app.isPackaged) {
    return join(process.resourcesPath, 'config', 'models.yaml');
  }
  // 開発時: out/main/index.js から見て ../../resources/config/models.yaml
  // __dirname は out/main なので、../../ でプロジェクトルートに戻る
  return join(app.getAppPath(), 'resources', 'config', 'models.yaml');
};

/** デフォルト設定 */
const defaultSettings: AppSettings = {
  theme: 'system',
  defaultProvider: 'openai',
  defaultModel: 'gpt-5-mini'
};

/** モデル設定のキャッシュ */
let cachedModelsConfig: ModelsConfigFile | null = null;

/** 設定のキャッシュ */
let cachedSettings: AppSettings | null = null;

/**
 * モデル設定を読み込む
 */
async function loadModelsConfig(): Promise<ModelsConfigFile> {
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }

  try {
    const configPath = getModelsConfigPath();
    const content = await readFile(configPath, 'utf-8');
    cachedModelsConfig = yaml.load(content) as ModelsConfigFile;
    return cachedModelsConfig;
  } catch (error) {
    console.error('Failed to load models config:', error);
    // デフォルト設定を返す
    return {
      providers: {
        openai: {
          name: 'OpenAI',
          enabled: true,
          models: [
            { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: '高速でコスト効率の良いモデル', isDefault: true }
          ]
        },
        anthropic: { name: 'Anthropic', enabled: false, models: [] },
        google: { name: 'Google', enabled: false, models: [] },
        local: { name: 'Local', enabled: false, models: [] }
      }
    };
  }
}

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

  ipcMain.handle('get-available-models', async (): Promise<AvailableModelsResponse> => {
    const config = await loadModelsConfig();
    return {
      providers: config.providers
    };
  });
}

/**
 * 設定を取得する
 */
export async function getSettings(): Promise<AppSettings> {
  if (cachedSettings) {
    return cachedSettings as AppSettings;
  }

  try {
    const data = await readFile(getSettingsPath(), 'utf-8');
    cachedSettings = { ...defaultSettings, ...JSON.parse(data) };
    return cachedSettings as AppSettings;
  } catch {
    // 設定ファイルがなければデフォルトを返す
    cachedSettings = defaultSettings;
    return cachedSettings as AppSettings;
  }
}

/**
 * 設定を保存する
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  cachedSettings = settings;
  
  // APIキーが変更された可能性があるのでプロバイダーをリセット
  resetProviders();
}
