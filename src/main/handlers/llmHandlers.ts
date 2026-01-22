/**
 * LLM関連のIPCハンドラ
 */
import { ipcMain } from 'electron';
import { OpenAIProvider } from '../llm/openaiProvider';
import { getSettings } from './settingsHandlers';
import type { LLMRequest, LLMResponse } from '@shared/ipc';

/** LLMプロバイダーのインスタンスキャッシュ */
let openaiProvider: OpenAIProvider | null = null;

/**
 * LLM関連のIPCハンドラを登録する
 */
export function registerLLMHandlers(): void {
  ipcMain.handle('send-llm-request', async (_, request: LLMRequest): Promise<LLMResponse> => {
    const settings = await getSettings();

    switch (request.provider) {
      case 'openai': {
        if (!settings.openaiApiKey) {
          throw new Error('OpenAI APIキーが設定されていません');
        }
        if (!openaiProvider) {
          openaiProvider = new OpenAIProvider(settings.openaiApiKey);
        }
        return openaiProvider.chat(request);
      }
      case 'anthropic':
        throw new Error('Anthropicプロバイダーは未実装です');
      case 'google':
        throw new Error('Googleプロバイダーは未実装です');
      case 'local':
        throw new Error('Localプロバイダーは未実装です');
      default:
        throw new Error(`未知のプロバイダー: ${request.provider}`);
    }
  });
}

/**
 * APIキー変更時にプロバイダーをリセットする
 */
export function resetProviders(): void {
  openaiProvider = null;
}
