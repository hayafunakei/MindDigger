/**
 * データモデルの型定義
 * README.mdのデータモデル仕様に基づく
 */

/** LLMプロバイダー種別 */
export type Provider = 'openai' | 'anthropic' | 'google' | 'local';

/** メッセージのロール */
export type Role = 'user' | 'assistant' | 'system';

/** ノードの種別 */
export type NodeType = 'root' | 'message' | 'note' | 'topic';

/** 各種ID型（型安全のためのブランド型） */
export type NodeId = string;
export type BoardId = string;

/**
 * ボード設定
 */
export interface BoardSettings {
  /** デフォルトのLLMプロバイダ */
  defaultProvider: Provider;
  /** デフォルトモデル名（例: gpt-4.1） */
  defaultModel: string;
  /** 生成温度（0〜1） */
  temperature: number;
}

/**
 * ボード（1つの検討テーマ/プロジェクト）
 */
export interface Board {
  id: BoardId;
  /** ボード名（例: 新規アプリ構想） */
  title: string;
  /** テーマ/悩みの全体説明 */
  description?: string;
  /** 中央に配置されるrootノードのID */
  rootNodeId: NodeId;
  /** ISO8601形式 */
  createdAt: string;
  /** ISO8601形式 */
  updatedAt: string;
  settings: BoardSettings;
}

/**
 * ノードのメタ情報
 */
export interface NodeMetadata {
  /** 重要度（1-5、AI提案＋手動編集） */
  importance?: 1 | 2 | 3 | 4 | 5;
  /** タグ（"risk", "idea", "UI" など） */
  tags?: string[];
  /** ピン留め（決定事項や特に重要なノード） */
  pin?: boolean;
}

/**
 * LLM使用量情報
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costJPY?: number;
}

/**
 * ノード位置
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * マインドマップ上の1つのノード
 * 1ノード＝1メッセージ（or 1メモ）の単位
 */
export interface MindNode {
  id: NodeId;
  boardId: BoardId;

  /** ノード種別: 'root' | 'message' | 'note' | 'topic' */
  type: NodeType;
  /** user / assistant / system */
  role: Role;
  /** ノードの短い見出し（任意） */
  title: string;
  /** 実際の内容（質問文・回答文・メモ・トピック名など） */
  content: string;

  /** 親ノードID（複数親を許可）。rootは[] */
  parentIds: NodeId[];
  /** 子ノードID */
  childrenIds: NodeId[];

  /** LLMプロバイダ（assistantノード用） */
  provider?: Provider;
  /** 使用モデル */
  model?: string;
  /** トークン使用量 */
  usage?: TokenUsage;

  /** 作成者 */
  createdBy: 'user' | 'ai';
  /** ISO8601形式 */
  createdAt: string;
  /** ISO8601形式 */
  updatedAt: string;

  /** キャンバス上の位置 */
  position: NodePosition;

  /** メタ情報 */
  metadata?: NodeMetadata;

  /** 質問・回答ペアの識別子（任意） */
  qaPairId?: string;

  /** ローディング中かどうか（AI回答待ち状態） */
  isLoading?: boolean;
}

/** サマリーのスコープ */
export type SummaryScope = 'board' | 'nodeSubtree';

/**
 * サマリー
 */
export interface Summary {
  id: string;
  boardId: BoardId;
  /** 'board' | 'nodeSubtree' */
  scope: SummaryScope;
  /** nodeSubtreeの場合に使用 */
  targetNodeId?: NodeId;

  /** 要約テキスト（Markdown想定） */
  content: string;

  provider: Provider;
  model: string;
  /** ISO8601形式 */
  createdAt: string;
  /** ISO8601形式 */
  updatedAt: string;
}

/**
 * ボードデータ（保存用）
 */
export interface BoardData {
  board: Board;
  nodes: MindNode[];
  summaries: Summary[];
}
