/**
 * IPC通信用の型定義
 */
import type { Board, BoardData, MindNode } from './types';

/**
 * アプリ設定
 */
export interface AppSettings {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  localEndpoint?: string;
  theme?: 'light' | 'dark' | 'system';
}

/**
 * LLMリクエスト
 */
export interface LLMRequest {
  provider: 'openai' | 'anthropic' | 'google' | 'local';
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * LLMレスポンス
 */
export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * IPC APIの型定義
 */
export interface ElectronAPI {
  // ファイル操作
  openBoard: () => Promise<BoardData | null>;
  saveBoard: (data: BoardData, filePath?: string) => Promise<string | null>;
  loadBoardFromPath: (filePath: string) => Promise<BoardData | null>;
  
  // 設定
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  
  // LLM
  sendLLMRequest: (request: LLMRequest) => Promise<LLMResponse>;
  
  // ダイアログ
  showSaveDialog: () => Promise<string | null>;
  showOpenDialog: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
