/**
 * LLM関連のIPCハンドラ
 */
import { ipcMain } from 'electron';
import { OpenAIProvider } from '../llm/openaiProvider';
import { getSettings } from './settingsHandlers';
import type { LLMRequest, LLMResponse, GenerateTopicCollectionRequest, GeneratedTopicCollectionItem, GenerateNoteRequest, GenerateSummaryRequest } from '@shared/ipc';

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

  // トピック集生成
  ipcMain.handle('generate-topic-collection', async (_, request: GenerateTopicCollectionRequest): Promise<GeneratedTopicCollectionItem[]> => {
    const settings = await getSettings();
    if (!settings.openaiApiKey) {
      throw new Error('OpenAI APIキーが設定されていません');
    }
    if (!openaiProvider) {
      openaiProvider = new OpenAIProvider(settings.openaiApiKey);
    }
    return openaiProvider.generateTopicCollection(request);
  });

  // ノート生成
  ipcMain.handle('generate-note', async (_, request: GenerateNoteRequest): Promise<string> => {
    const settings = await getSettings();
    if (!settings.openaiApiKey) {
      throw new Error('OpenAI APIキーが設定されていません');
    }
    if (!openaiProvider) {
      openaiProvider = new OpenAIProvider(settings.openaiApiKey);
    }
    return openaiProvider.generateNote(request);
  });

  // サマリー生成
  ipcMain.handle('generate-summary', async (_, request: GenerateSummaryRequest): Promise<string> => {
    const settings = await getSettings();
    if (!settings.openaiApiKey) {
      throw new Error('OpenAI APIキーが設定されていません');
    }
    if (!openaiProvider) {
      openaiProvider = new OpenAIProvider(settings.openaiApiKey);
    }
    return openaiProvider.generateSummary(request);
  });
}

/**
 * APIキー変更時にプロバイダーをリセットする
 */
export function resetProviders(): void {
  openaiProvider = null;
}
