/**
 * IPC通信用の型定義
 */
import type { Board, BoardData, MindNode, ModelConfig, Provider } from './types';

/**
 * 利用可能なモデル一覧のレスポンス
 */
export interface AvailableModelsResponse {
  /** プロバイダーごとのモデル一覧 */
  providers: Record<Provider, {
    name: string;
    enabled: boolean;
    models: ModelConfig[];
  }>;
}

/**
 * アプリ設定
 */
export interface AppSettings {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  localEndpoint?: string;
  theme?: 'light' | 'dark' | 'system';
  parentFolderPath?: string; // ボードを管理する親フォルダ
  /** デフォルトのLLMプロバイダー */
  defaultProvider?: 'openai' | 'anthropic' | 'google' | 'local';
  /** デフォルトのモデル */
  defaultModel?: string;
  /** トピック生成用モデル */
  topicGenerationModel?: string;
}

/**
 * ボード情報（一覧表示用）
 */
export interface BoardInfo {
  id: string;
  title: string;
  description?: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
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
 * トピック生成リクエスト
 */
export interface GenerateTopicsRequest {
  content: string;
  context?: string;
  maxTopics?: number;
  /** 使用するモデル */
  model?: string;
}

/**
 * トピック生成レスポンス
 */
export interface GeneratedTopic {
  title: string;
  description?: string;
  importance?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
}

/**
 * ノート生成リクエスト
 */
export interface GenerateNoteRequest {
  content: string;
  context?: string;
  /** 使用するモデル */
  model?: string;
}

/**
 * サマリー生成リクエスト
 */
export interface GenerateSummaryRequest {
  boardId: string;
  scope: 'board' | 'nodeSubtree';
  targetNodeId?: string;
  nodes: Array<{
    id: string;
    type: string;
    role: string;
    title: string;
    content: string;
    importance?: number;
    pin?: boolean;
    tags?: string[];
  }>;
  /** 使用するモデル */
  model?: string;
}

/**
 * IPC APIの型定義
 */
export interface ElectronAPI {
  // ファイル操作
  openBoard: () => Promise<BoardData | null>;
  saveBoard: (data: BoardData, filePath?: string) => Promise<string | null>;
  loadBoardFromPath: (filePath: string) => Promise<BoardData | null>;
  
  // ボード管理
  getBoardList: () => Promise<BoardInfo[]>; // 親フォルダ内のボード一覧を取得
  selectParentFolder: () => Promise<string | null>; // 親フォルダを選択
  
  // 設定
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  getAvailableModels: () => Promise<AvailableModelsResponse>;
  
  // LLM
  sendLLMRequest: (request: LLMRequest) => Promise<LLMResponse>;
  generateTopics: (request: GenerateTopicsRequest) => Promise<GeneratedTopic[]>;
  generateNote: (request: GenerateNoteRequest) => Promise<string>;
  generateSummary: (request: GenerateSummaryRequest) => Promise<string>;
  
  // ダイアログ
  showSaveDialog: () => Promise<string | null>;
  showOpenDialog: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
