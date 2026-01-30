/**
 * 設定状態管理ストア
 */
import { create } from 'zustand';
import type { AppSettings, AvailableModelsResponse } from '@shared/ipc';
import type { ModelConfig, Provider } from '@shared/types';

interface SettingsState {
  settings: AppSettings;
  isLoaded: boolean;
  /** 利用可能なモデル一覧 */
  availableModels: AvailableModelsResponse | null;
}

interface SettingsActions {
  /** 設定を読み込む */
  loadSettings: () => Promise<void>;
  /** 設定を更新 */
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  /** 利用可能なモデル一覧を読み込む */
  loadAvailableModels: () => Promise<void>;
  /** 指定プロバイダーのモデル一覧を取得 */
  getModelsForProvider: (provider: Provider) => ModelConfig[];
  /** 指定プロバイダーのデフォルトモデルを取得 */
  getDefaultModelForProvider: (provider: Provider) => string;
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  settings: {
    theme: 'system',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5-mini',
    topicGenerationModel: 'gpt-5-mini'
  },
  isLoaded: false,
  availableModels: null,

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      set({ settings, isLoaded: true });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoaded: true });
    }
  },

  updateSettings: async (updates) => {
    const newSettings = { ...get().settings, ...updates };
    await window.electronAPI.saveSettings(newSettings);
    set({ settings: newSettings });
  },

  loadAvailableModels: async () => {
    try {
      const models = await window.electronAPI.getAvailableModels();
      set({ availableModels: models });
    } catch (error) {
      console.error('Failed to load available models:', error);
    }
  },

  getModelsForProvider: (provider: Provider) => {
    const { availableModels } = get();
    if (!availableModels) return [];
    return availableModels.providers[provider]?.models || [];
  },

  getDefaultModelForProvider: (provider: Provider) => {
    const models = get().getModelsForProvider(provider);
    const defaultModel = models.find(m => m.isDefault);
    return defaultModel?.id || models[0]?.id || 'gpt-5-mini';
  }
}));
