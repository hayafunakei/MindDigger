## 1. アプリ概要

### 1.1 コンセプト

- ユーザーの「悩み」「企画案」「検討したいテーマ」を、  
  - マインドマップ風のノード（吹き出し）  
  - 生成AIとの対話  
  を組み合わせて整理・深掘りできるデスクトップアプリケーション。
- 特徴
  - 中央にテーマを置き、AIとの質疑応答をツリー状に展開。
  - 回答から自動生成される **topic ノード** をたどりながら論点を深掘り。
  - **note ノード** に決定事項をまとめ、右カラムでサマリー表示。
  - 複数の親ノード（複数文脈）を許容し、1つの回答を別の論点からも再利用可能。

### 1.2 技術スタック

- デスクトップアプリ: Electron
- フロントエンド: React + （ノードベースUIライブラリ：React Flow 想定）
- LLM接続: OpenAI / Anthropic / Google / Local 等（APIキーをユーザーが設定）
- データ保存: ローカルディレクトリに JSON ファイルとして保存（Git 管理も想定）

***

## 2. データモデル仕様

### 2.1 ID・基本型

```ts
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

ノードの重要度・見た目・決定事項などのメタ情報。

```ts
interface NodeMetadata {
  importance?: 1 | 2 | 3 | 4 | 5; // 重要度（AI提案＋手動編集）
  tags?: string[];                // "risk", "idea", "UI" など
  color?: string;                 // ノード色
  pin?: boolean;                  // 決定事項や特に重要なノード（サマリや表示で必ず扱う）
  collapsed?: boolean;           // 子ノードをUI上で畳むかどうか
}
```

運用方針:

- 初期値は AI で提案しても良い（importance, tags）。
- ユーザーが自由に編集可能。
- サマリー生成などで  
  - importance: 優先度  
  - pin: 「必ず含めるべきノード」  
  として扱う。

### 2.4 Node

マインドマップ上の1つのノード。  
1ノード＝1メッセージ（or 1メモ）の単位。

```ts
interface Node {
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
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costJPY?: number;
  };

  createdBy: 'user' | 'ai';
  createdAt: string;
  updatedAt: string;

  position: {
    x: number;
    y: number;
  };

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
    - `Node[]`（ノード一覧）
  - `summaries.json`  
    - `Summary[]`（サマリー履歴）

※アプリ全体設定（APIキーなど）は別ファイル想定。

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
- 複数文脈がある場合は、「別の親チェーンで見る」機能を後続検討（最初はシンプルにメイン親のみ）。

***

## 7. 質問ノードの編集ポリシー

- 「質問修正＝新ノードを作る」で統一。
- 挙動:
  - 子に回答（role: 'assistant'）が存在しない質問ノード  
    - content をそのまま編集可能。
  - 子に回答ノードが存在する質問ノード  
    - 直接編集は不可。  
    - 編集アクションを行うと「新しい質問としてフォーク」する。  
      - `parentIds` は元質問と同じ  
      - `childrenIds` は空で新規ノードとして扱う  
      - 元質問ノードと回答ノードの関係はそのまま維持。

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
  - スコア順にソート → 上位 N 件を LLM への入力に使用。

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
   - UI では最新の Summary を右ペインに表示。  
   - 再生成時は新しい Summary として追加（履歴管理は今後検討）。

***

## 9. 今後検討する余地のある点（メモ）

- UIの詳細
  - root / message / note / topic の見た目・色・アイコン。
  - メイン親とサブ親のエッジ表現（線の太さ・色）。
  - サマリーの表示位置（常に右ペイン固定か、ポップアップか）。
- ノードの再利用
  - 回答ノードを別の親に接続したときの自動サマリー更新タイミング。
- サマリーからノードへ逆リンク
  - サマリー中の箇条書きから、対応するノードをハイライトする UI。
