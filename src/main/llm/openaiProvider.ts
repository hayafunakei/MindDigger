/**
 * OpenAI LLMプロバイダー
 */
import OpenAI from 'openai';
import type { LLMRequest, LLMResponse, GenerateTopicsRequest, GeneratedTopic, GenerateNoteRequest, GenerateSummaryRequest } from '@shared/ipc';

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
      model: request.model || 'gpt-4o-mini',
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
   * トピックを生成する
   * @param request - トピック生成リクエスト
   * @returns 生成されたトピック配列
   */
  async generateTopics(request: GenerateTopicsRequest): Promise<GeneratedTopic[]> {
    const maxTopics = request.maxTopics || 5;
    const systemPrompt = `あなたは思考整理の専門家です。与えられた内容から、さらに深掘りすべき論点や検討事項を抽出してください。
各トピックは以下のJSON形式で出力してください：
{
  "title": "論点のタイトル（簡潔に）",
  "description": "論点の説明（省略可）",
  "importance": 1-5の重要度,
  "tags": ["タグ1", "タグ2"]
}

最大${maxTopics}個のトピックを配列形式で返してください。`;

    const userPrompt = request.context
      ? `以下の文脈を踏まえて：\n${request.context}\n\n次の内容から論点を抽出：\n${request.content}`
      : `次の内容から論点を抽出：\n${request.content}`;

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{"topics": []}';
    
    try {
      const parsed = JSON.parse(content);
      return parsed.topics || [];
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
      model: 'gpt-4o-mini',
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
    const scoredNodes = request.nodes.map(node => {
      let score = (node.importance || 3) * 10;
      if (node.pin) score += 100;
      if (node.type === 'note') score += 10;
      if (node.type === 'topic') score += 5;
      return { node, score };
    }).sort((a, b) => b.score - a.score);

    // 上位ノードを選択（最大20件）
    const topNodes = scoredNodes.slice(0, 20).map(s => s.node);

    const systemPrompt = `あなたは思考整理の専門家です。与えられたノード情報から、以下の観点で要約を作成してください：

1. **重要な論点**: 検討されている主要なテーマ
2. **決定事項**: pin付きノードやnoteノードから抽出
3. **未解決の課題**: topicノードから抽出
4. **次のアクション**: 今後検討すべき事項

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

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
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
