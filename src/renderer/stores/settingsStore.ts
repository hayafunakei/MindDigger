/**
 * 設定状態管理ストア
 */
import { create } from 'zustand';
import type { AppSettings } from '@shared/ipc';

interface SettingsState {
  settings: AppSettings;
  isLoaded: boolean;
}

interface SettingsActions {
  /** 設定を読み込む */
  loadSettings: () => Promise<void>;
  /** 設定を更新 */
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  settings: {
    theme: 'system'
  },
  isLoaded: false,

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
  }
}));
