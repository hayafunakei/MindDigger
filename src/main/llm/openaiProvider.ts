/**
 * OpenAI LLMプロバイダー
 */
import OpenAI from 'openai';
import type { LLMRequest, LLMResponse } from '@shared/ipc';

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
}
