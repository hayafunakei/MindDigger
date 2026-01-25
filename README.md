## 1. アプリ概要

### 1.1 コンセプト

- ユーザーの「悩み」「企画案」「検討したいテーマ」を、  
  - マインドマップ風のノード（吹き出し）  
  - 生成AIとの対話  
  を組み合わせて整理・深掘りできるデスクトップアプリケーション。
- 特徴
  - 中央にテーマを置き、AIとの質疑応答をツリー状に展開。
  - 回答から自動生成される **topic ノード** をたどりながら論点を深掘り。
  - **note ノード** に決定事項をまとめ、サイドパネルでサマリー表示。
  - 複数の親ノード（複数文脈）を許容し、1つの回答を別の論点からも再利用可能。

### 1.2 技術スタック

- デスクトップアプリ: Electron（electron-vite）
- フロントエンド: React + TypeScript + @xyflow/react（React Flow v11+）
- 状態管理: Zustand
- LLM接続: OpenAI（APIキーをユーザーが設定）
- データ保存: ローカルディレクトリに JSON ファイルとして保存（Git 管理も想定）

***

## 2. データモデル仕様

> 📁 **実装ファイル**: [src/shared/types.ts](src/shared/types.ts)

### 2.1 ID・基本型

```ts
// 型定義では4種類定義済み、現在はOpenAIのみ対応
type Provider = 'openai' | 'anthropic' | 'google' | 'local';
type Role = 'user' | 'assistant' | 'system';
type NodeType = 'root' | 'message' | 'note' | 'topic';

type NodeId = string;
type BoardId = string;
```

### 2.2 Board

1つの検討テーマ（プロジェクト）を表す単位。

```ts
interface Board {
  id: BoardId;
  title: string;            // ボード名（例: 新規アプリ構想）
  description?: string;     // テーマ/悩みの全体説明（冒頭で書き出した内容）
  rootNodeId: NodeId;       // 中央に配置される root ノードの ID
  createdAt: string;        // ISO8601
  updatedAt: string;        // ISO8601
  settings: BoardSettings;
}
```

```ts
interface BoardSettings {
  defaultProvider: Provider; // デフォルトの LLM プロバイダ
  defaultModel: string;      // デフォルトモデル名（例: gpt-4.1）
  temperature: number;       // 生成温度（0〜1）
}
```

### 2.3 NodeMetadata

ノードの重要度・決定事項などのメタ情報。

```ts
interface NodeMetadata {
  importance?: 1 | 2 | 3 | 4 | 5; // 重要度（AI提案＋手動編集）
  tags?: string[];                // "risk", "idea", "UI" など
  pin?: boolean;                  // 決定事項や特に重要なノード（サマリや表示で必ず扱う）
}
```

運用方針:

- 初期値は AI で提案しても良い（importance, tags）。
- ユーザーが自由に編集可能。
- サマリー生成などで  
  - importance: 優先度  
  - pin: 「必ず含めるべきノード」  
  として扱う。

### 2.4 MindNode

マインドマップ上の1つのノード。  
1ノード＝1メッセージ（or 1メモ）の単位。

> ※ DOMの`Node`との衝突を避けるため`MindNode`という名前を使用

```ts
// トークン使用量
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costJPY?: number;  // 将来実装予定
}

// ノード位置
interface NodePosition {
  x: number;
  y: number;
}

interface MindNode {
  id: NodeId;
  boardId: BoardId;

  type: NodeType;           // 'root' | 'message' | 'note' | 'topic'
  role: Role;               // user / assistant / system
  title: string;            // ノードの短い見出し（任意）
  content: string;          // 実際の内容（質問文・回答文・メモ・トピック名など）

  // グラフ構造（複数親を許可）
  parentIds: NodeId[];      // root は []
  childrenIds: NodeId[];

  // LLM 呼び出し情報（assistant message ノード中心）
  provider?: Provider;
  model?: string;
  usage?: TokenUsage;

  createdBy: 'user' | 'ai';
  createdAt: string;
  updatedAt: string;

  position: NodePosition;

  metadata?: NodeMetadata;

  // 質問・回答ペアとして扱うための識別子（任意）
  qaPairId?: string;        // 同じ値を持つ user/assistant ノードを1セットとしてUI表示
}
```

#### NodeType の運用

- `root`  
  - ボードのテーマ・出発点。  
  - parentIds は常に `[]`。
- `message`  
  - ユーザーの質問（role: 'user'）  
  - AIの回答（role: 'assistant'）
- `note`  
  - 決定事項や注釈。  
  - 回答からAIで下書き → ユーザーが修正 → `pin` で確定。
- `topic`  
  - 「まだ質問にしていない論点」や「検討すべき観点」。  
  - 主に回答ノードの周囲に AI から自動生成。

***

## 3. ファイル構成

1ボード = 1ディレクトリ。

- `project-root/`
  - `board.json`  
    - `Board` 1件
  - `nodes.json`  
    - `MindNode[]`（ノード一覧）
  - `summaries.json`  
    - `Summary[]`（サマリー履歴）

### 3.1 BoardData

ボードの読み込み・保存時に使用する統合型。

```ts
interface BoardData {
  board: Board;
  nodes: MindNode[];
  summaries: Summary[];
}
```

### 3.2 AppSettings

アプリ全体設定（`settings.json`に保存）。

```ts
interface AppSettings {
  openaiApiKey?: string;
  anthropicApiKey?: string;   // 将来対応予定
  googleApiKey?: string;      // 将来対応予定
  localEndpoint?: string;     // 将来対応予定
  theme?: 'light' | 'dark' | 'system';
  parentFolderPath?: string;  // ボード保存先の親フォルダ
}
```

***

## 4. サマリー用データ構造

```ts
type SummaryScope = 'board' | 'nodeSubtree';

interface Summary {
  id: string;
  boardId: BoardId;
  scope: SummaryScope;          // 'board' | 'nodeSubtree'
  targetNodeId?: NodeId;        // nodeSubtree の場合に使用

  content: string;              // 要約テキスト（Markdown想定）

  provider: Provider;
  model: string;
  createdAt: string;
  updatedAt: string;
}
```

***

## 5. ユーザー操作とデータ更新フロー

### 5.1 初期設定

- 操作
  - 設定画面で API キーを入力。
  - デフォルト provider / model / temperature を選択。
- データ
  - アプリ全体設定ファイルに保存。
  - Board 作成時に `Board.settings` にコピー or 参照。

### 5.2 ボード作成〜最初の質問・回答

#### 5.2.1 ボード作成

- 操作
  - 「新規ボード」クリック → タイトル・概要（description）入力。
- データ
  - 新しい `Board` を生成。
  - `rootNodeId` を持つ `root` ノードを同時に作成。
  - root ノードの `content` にテーマ・悩み全文を保存。  
  - `metadata.pin = true` / `importance = 5` 等。
  - **初期質問ノードも自動作成**: `type: 'message', role: 'user'` の空の質問ノードを root の子として作成。ユーザーはすぐに質問を入力可能。

#### 5.2.2 最初の質問（root 直下）

- 操作（root のコントロール）
  - root を選択 → 質問入力 → モデル選択（省略可） → 送信。
- データ
  - `type: 'message', role: 'user'` の質問ノードを root の子として作成。  
  - `parentIds: [rootNodeId]`  
  - root の `childrenIds` に質問ノード ID を追加。

#### 5.2.3 回答ノード生成

- 操作
  - 質問送信後、AI呼び出し → 回答表示。
- データ
  - 質問ノードのコンテキスト用に、  
    - `parentIds[0]` をメイン親として root まで辿る + その他親も含めて文脈収集。  
    - 収集したノードをプロンプトに含める。
  - `type: 'message', role: 'assistant'` の回答ノードを作成。  
  - `parentIds: [questionNode.id]`（メイン親）  
  - 質問ノードの `childrenIds` に回答ノード ID を追加。
  - 質問・回答両方に同一 `qaPairId` を付与してUI上ペア表示。

### 5.3 回答から topic ノード生成

- 操作（回答ノードのコントロール）
  - 「関連トピックを生成」ボタンを押す、もしくは自動実行。
- データ
  - 回答ノードの `content` を LLM に渡し、関連論点（topic 名）を生成。
  - `type: 'topic'` のノードを複数作成。  
    - `parentIds: [answerNode.id]`  
    - answerNode の `childrenIds` に topic ノード ID を追加。
  - `metadata.importance` や `tags` は LLM による初期推定を許可してもよい。

### 5.4 topic → 質問 → 回答 → note

#### 5.4.1 topic ノードから質問ノード作成

- 操作（topic のコントロール）
  - 「質問を作成」ボタン → 質問文入力 → 送信。
- データ
  - `type: 'message', role: 'user'` の質問ノードを topic の子として作成。  
    - `parentIds: [topicNode.id]`  
    - topicNode の `childrenIds` に質問ノード ID を追加。

#### 5.4.2 質問ノードに別 topic を接続

- 操作
  - 質問ノードで「topic接続モード」を開始 → 他の topic ノードをクリック。
- データ
  - 選択した topic の ID を質問ノードの `parentIds` に追加。  
  - 該当 topic の `childrenIds` に質問ノード ID を追加。  
  - `parentIds[0]` がメイン親としてタイムライン・太線表示に用いられ、それ以外はサブ親となる。

#### 5.4.3 note ノード作成（決定事項）

- 操作（任意ノードのコントロール）
  - 「note を作成」ボタン。  
  - 回答から AI に下書き生成 → ユーザーが修正 → 保存。  
  - 必要なら「ピン留め」ON。
- データ
  - `type: 'note', role: 'user'` のノードを作成。  
  - `parentIds: [fromNode.id]`  
  - fromNode の `childrenIds` に note ノード ID を追加。  
  - 決定事項なら `metadata.pin = true`, `tags` に `"decision"` など。

***


## 6. タイムライン表示と親ノードの扱い

### 6.1 parentIds の意味

- `parentIds` は複数を許可し、ノードは複数の文脈に属し得る。
- 表示上のルール
  - `parentIds[0]` を **メイン親** として扱う。  
    - タイムライン表示: メイン親チェーンに沿って root まで辿る。  
    - マインドマップ表示: メイン親へのエッジを太線、他は細線。
  - メイン親の付け替えは、`parentIds` 配列の並び替えで表現。

### 6.2 タイムライン表示

- 起点ノードを1つ選択し、  
  - `parentIds[0]` を辿って root までさかのぼる。  
  - そのチェーンを時系列順に並べて右ペインに表示。

***

## 7. 質問ノードの編集ポリシー

- 「質問修正＝新ノードを作る」で統一。
- 挙動:
  - 子に回答（role: 'assistant'）が存在しない質問ノード  
    - content をそのまま編集可能。
  - 子に回答ノードが存在する質問ノード  
    - 子孫にさらに質問がある場合　→ 編集不可　複製する
    - 回答はあるが、その後に質問ノードがない場合　→ 質問を再送信できる（既存の回答は破棄される）

***

## 8. サマリー生成仕様

### 8.1 サマリー種別

- ボード全体サマリー  
  - `scope: 'board'`, `targetNodeId: undefined`
- ノード配下サマリー  
  - `scope: 'nodeSubtree'`, `targetNodeId: NodeId`

### 8.2 対象ノード収集

- ボード全体  
  - `nodes.json` 内の全ノードを対象。
- ノード配下  
  - `targetNodeId` を起点に、`childrenIds` を辿って下方向に DFS/BFS。  
  - 親方向は辿らない（文脈よりも「どんな展開になっているか」を重視）。

### 8.3 要約対象ノードのフィルタ

- `type !== 'root'` を基本対象。
- message / note / topic を主に要約へ利用。

### 8.4 importance / pin / type によるスコアリング

- スコア計算例（実装は調整可）:

  - `base = (importance ?? 3) * 10`  
  - `pin == true` なら +100（必ず含めたい）  
  - `type == 'note'` なら +10  
  - `type == 'topic'` なら +5

- コンテキストに含めるノード数を制限するため、  
  - スコア順にソート → 上位 **20件** を LLM への入力に使用。

### 8.5 プロンプト構成

- system メッセージ例（要約ルール）:
  - importance が高いノードを優先。
  - pin ノード（決定事項）は必ず含める。
  - note ノードは「結論・決定事項」として扱う。
  - topic ノードは「論点・検討項目」として扱う。

- user メッセージ:
  - 対象範囲（ボード全体 or 特定ノード配下）を説明。
  - ノード一覧（id, type, role, content, importance, pin, tags, parents, children）を JSON 的フォーマットで渡す。
  - 生成してほしい構造:
    - 重要な論点のリスト
    - 現時点の決定事項
    - 未解決の課題や次のアクション

### 8.6 サマリー生成〜保存フロー

1. ユーザー操作
   - 右ペインで「全体サマリー」/「このノード周辺を要約」ボタンを押す。
2. ノード収集
   - scope に応じて対象ノード集合を取得。
3. フィルタ・スコアリング
   - root 以外を対象に、スコア順に並び替え、上位 N 件を選択。
4. プロンプト生成
   - system / user メッセージを組み立て。
5. LLM 呼び出し
   - Board.settings の provider / model を基本に実行。
6. 結果保存
   - 生成されたテキストを `Summary` として `summaries.json` に保存。
   - UI では最新の Summary をサイドパネルに表示。  
   - 再生成時は新しい Summary として追加（履歴管理は今後検討）。

***

## 9. UI機能

### 9.1 メインレイアウト

- **ツールバー**: 新規ボード作成、ボードを開く、保存、設定ボタン
- **マインドマップキャンバス**: React Flow使用、ドラッグ、ズーム、MiniMap、Controls
- **サイドパネル**: リサイズ可能（280px〜600px）、選択ノードの詳細・操作を表示
- **ボード情報ボタン**: 左下に常時表示、クリックでボード詳細モーダルを表示

### 9.2 ノード表示

- **root**: ボードテーマを表示、質問開始の起点
- **message (user)**: 質問テキスト、編集可能（条件付き）
- **message (assistant)**: 回答テキスト、使用モデル表示、複製ボタン
- **note**: ピン表示、importance星表示、decisionタグ表示
- **topic**: タグ表示、importance表示、ピン対応

### 9.3 エッジ表示

- メイン親（`parentIds[0]`）→ 太線で接続
- サブ親（`parentIds[1+]`）→ 細線＋アニメーションで接続

### 9.4 モーダル・ダイアログ

- **設定ダイアログ**: OpenAI APIキー入力、親フォルダ選択
- **ボード選択ダイアログ**: 親フォルダ内のボード一覧表示・選択
- **ボード情報モーダル**: ボード詳細表示（タイトル、説明、設定、作成日時）
- **タイムラインモーダル**: メイン親チェーン表示、Markdown対応、ノードナビゲート、ESCキーで閉じる
- **トピック作成モーダル**: 手動トピック作成（タイトル、importance、tags）

### 9.5 質問ノードの操作

- **複製ボタン**: 回答済み質問をホバーすると表示、質問をフォーク可能
- **親ノード接続モード**: 接続モードを開始 → キャンバス上で他のtopicをクリック → 複数親として接続
- **質問フォーク機能**: 回答済み質問の編集時に「フォーク」を提案、新しい質問ノードとして複製

### 9.6 コンテキスト収集

- メイン親チェーン（`parentIds[0]`を辿ってrootまで）を収集
- サブ親チェーン（`parentIds[1+]`）も含めて文脈を構築
- 収集したノードをLLMプロンプトに含めて回答を生成

***

## 10. 将来対応予定

以下の機能は将来のバージョンで実装予定です。

### 10.1 追加LLMプロバイダ

現在はOpenAIのみ対応ですが、以下のプロバイダへの対応を予定しています：

```ts
// 将来対応予定
type Provider = 'openai' | 'anthropic' | 'google' | 'local';
```

- **Anthropic**: Claude モデルへの対応
- **Google**: Gemini モデルへの対応
- **Local**: ローカルLLM（Ollama等）への対応

### 10.2 トピック/ノート生成のモデル選択

現在、トピック生成とノート生成は `gpt-4o-mini` 固定で実行されます。

将来的には以下のように選択可能にする予定：

- **トピック生成**: `gpt-4o-mini` など低コストモデル固定（大量生成のため）
- **ノート生成**: `Board.settings.defaultModel` を使用（ユーザーが選択可能）

### 10.3 トークン使用量・コスト表示

現在、トークン使用量（`usage`）はデータとして保存されていますが、UIには表示されていません。

将来的に以下の機能を追加予定：

- ノード単位のトークン使用量表示
- ボード全体のトークン累計表示
- コスト計算（`costJPY`）と表示

```ts
// 現在は型定義のみ
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costJPY?: number;  // 将来実装予定
}
```

***
