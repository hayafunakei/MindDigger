/**
 * OpenAI LLMプロバイダー
 */
import OpenAI from 'openai';
import type { LLMRequest, LLMResponse, GenerateTopicCollectionRequest, GeneratedTopicCollectionItem, GenerateNoteRequest, GenerateSummaryRequest } from '@shared/ipc';

/**
 * OpenAI APIを使用したLLMプロバイダー
 */
export class OpenAIProvider {
  private client: OpenAI;

  /**
   * OpenAIProviderを初期化する
   * @param apiKey - OpenAI APIキー
   */
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * チャットリクエストを送信する
   * @param request - LLMリクエスト
   * @returns LLMレスポンス
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model || 'gpt-5-mini',
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens
    });

    const choice = response.choices[0];
    const content = choice?.message?.content || '';
    
    return {
      content,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined
    };
  }

  /**
   * 回答内容を網羅するトピック集の項目を生成する
   * @param request - トピック集生成リクエスト
   * @returns 生成されたトピック集項目の配列
   */
  async generateTopicCollection(
    request: GenerateTopicCollectionRequest
  ): Promise<GeneratedTopicCollectionItem[]> {
    const systemPrompt = `あなたは思考整理の専門家です。与えられた回答に含まれる、追加で質問・検討できる論点を漏れなく分解してください。
回答の内容を網羅することを優先し、任意の件数上限を設けないでください。重複する項目は統合し、単なる言い換えは避けてください。
各項目は短く具体的なタイトルと、質問・検討の焦点が分かる短い概要にします。

必ず次のJSON形式で返してください：
{
  "items": [
    {
      "title": "項目のタイトル",
      "description": "項目の短い概要"
    }
  ]
}`;

    const userPrompt = request.context
      ? `以下の文脈を踏まえて：\n${request.context}\n\n次の回答からトピック集の項目を抽出：\n${request.content}`
      : `次の回答からトピック集の項目を抽出：\n${request.content}`;

    const response = await this.client.chat.completions.create({
      model: request.model || 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{"items": []}';
    
    try {
      const parsed = JSON.parse(content) as { items?: unknown };
      if (!Array.isArray(parsed.items)) return [];

      return parsed.items.flatMap((item): GeneratedTopicCollectionItem[] => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as { title?: unknown; description?: unknown };
        if (typeof candidate.title !== 'string' || !candidate.title.trim()) return [];

        return [{
          title: candidate.title.trim(),
          description: typeof candidate.description === 'string'
            ? candidate.description.trim()
            : ''
        }];
      });
    } catch {
      return [];
    }
  }

  /**
   * ノートの下書きを生成する
   * @param request - ノート生成リクエスト
   * @returns 生成されたノートの内容
   */
  async generateNote(request: GenerateNoteRequest): Promise<string> {
    const systemPrompt = `あなたは思考整理の専門家です。与えられた内容から、決定事項や重要なポイントをまとめたメモを作成してください。
簡潔で分かりやすい箇条書き形式を推奨します。`;

    const userPrompt = request.context
      ? `以下の文脈を踏まえて：\n${request.context}\n\n次の内容をまとめてください：\n${request.content}`
      : `次の内容をまとめてください：\n${request.content}`;

    const response = await this.client.chat.completions.create({
      model: request.model || 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * サマリーを生成する
   * @param request - サマリー生成リクエスト
   * @returns 生成されたサマリー
   */
  async generateSummary(request: GenerateSummaryRequest): Promise<string> {
    // ノードをスコアリングしてソート
    const scoredNodes = request.nodes
      .filter((node) => node.type !== 'topicCollection')
      .map(node => {
      let score = (node.importance || 3) * 10;
      if (node.pin) score += 100;
      if (node.type === 'note') score += 10;
      if (node.type === 'topic') score += 5;
      return { node, score };
    })
      .sort((a, b) => b.score - a.score);

    // 上位ノードを選択（最大20件）
    const topNodes = scoredNodes.slice(0, 20).map(s => s.node);

    const systemPrompt = `あなたは思考整理の専門家です。与えられたノード情報から、以下の観点で要約を作成してください：

1. **重要なトピック**: 検討されている主要なテーマ
2. **決定事項**: 📌ピン留めされたノードから抽出（ピン留め = 確定・決定を意味する）
3. **メモ・検討内容**: noteノードの内容を要約
4. **未解決の課題**: topicノードから抽出
5. **次のアクション**: 今後検討すべき事項

各セクションは該当する情報がある場合のみ出力してください。
簡潔で分かりやすいMarkdown形式で出力してください。
重要: \`\`\`markdown などのコードブロックで囲まないでください。直接Markdownを出力してください。`;

    const nodesInfo = topNodes.map(node => {
      const metadata = [];
      if (node.pin) metadata.push('📌ピン留め');
      if (node.importance && node.importance >= 4) metadata.push(`重要度:${node.importance}`);
      if (node.tags && node.tags.length > 0) metadata.push(`タグ:${node.tags.join(',')}`);
      
      return `## [${node.type}] ${node.title || '無題'}
${metadata.length > 0 ? `**メタ情報**: ${metadata.join(' / ')}\n` : ''}
**内容**: ${node.content.substring(0, 300)}${node.content.length > 300 ? '...' : ''}
`;
    }).join('\n---\n\n');

    const scopeDescription = request.scope === 'board' 
      ? 'ボード全体' 
      : '選択されたノード配下';

    const userPrompt = `${scopeDescription}の情報から要約を作成してください：

${nodesInfo}`;

    // デバッグ用: LLMに送るプロンプトをログ出力
    console.group('📋 [Main] Summary LLM Request');
    console.log('Scope:', request.scope);
    console.log('Original Nodes Count:', request.nodes.length);
    console.log('Top Nodes Count (after scoring):', topNodes.length);
    console.log('--- System Prompt ---');
    console.log(systemPrompt);
    console.log('--- User Prompt ---');
    console.log(userPrompt);
    console.groupEnd();

    const response = await this.client.chat.completions.create({
      model: request.model || 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    let content = response.choices[0]?.message?.content || '';
    
    // コードブロックで囲まれている場合は除去
    content = content.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/i, '');
    
    return content;
  }
}
