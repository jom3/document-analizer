import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { CompletionUsage } from 'openai/resources/completions';
import { DEFAULT_MODEL } from './ai.constants.js';
import { ANALYSIS_SYSTEM_PROMPT } from './prompts/analysis.system.js';
import { ANALYSIS_JSON_SCHEMA } from './schemas/analysis.schema.js';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from '../search/search.constants.js';
import {
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_MODEL,
  CHAT_TEMPERATURE,
} from '../chat/chat.constants.js';

export interface DocumentAnalysisResult {
  documentType: string;
  confidence: number;
  summary: string;
  keyInfo: Record<string, unknown>;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface EmbeddingsResult {
  embeddings: number[][];
  totalTokens: number;
}

export interface StreamChatResult {
  model: string;
  deltas: AsyncIterable<string>;
  usage: CompletionUsage | undefined;
}

@Injectable()
export class OpenAiService {
  private openai: OpenAI | null = null;

  private get client(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAiService: OPENAI_API_KEY is not configured');
    }
    this.openai ??= new OpenAI({ apiKey });
    return this.openai;
  }

  private get model(): string {
    return process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  }

  private get embeddingModel(): string {
    return process.env.EMBEDDING_MODEL ?? EMBEDDING_MODEL;
  }

  private get chatModel(): string {
    return process.env.CHAT_MODEL ?? CHAT_MODEL;
  }

  async createEmbeddings(texts: string[]): Promise<EmbeddingsResult> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      dimensions: EMBEDDING_DIMENSIONS,
      input: texts,
    });

    return {
      embeddings: response.data.map((item) => item.embedding),
      totalTokens: response.usage?.total_tokens ?? 0,
    };
  }

  async streamChatCompletion(
    messages: ChatCompletionMessageParam[],
  ): Promise<StreamChatResult> {
    const stream = await this.client.chat.completions.create({
      model: this.chatModel,
      temperature: CHAT_TEMPERATURE,
      max_tokens: CHAT_MAX_OUTPUT_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      messages,
    });

    const holder: { usage?: CompletionUsage } = {};

    async function* generateDeltas(): AsyncIterable<string> {
      for await (const chunk of stream) {
        if (chunk.usage) {
          holder.usage = chunk.usage;
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    }

    return {
      model: this.chatModel,
      deltas: generateDeltas(),
      get usage() {
        return holder.usage;
      },
    };
  }

  async analyzeDocument(text: string): Promise<DocumentAnalysisResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'document_analysis',
          strict: true,
          schema: ANALYSIS_JSON_SCHEMA,
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI devolvió una respuesta vacía');
    }

    const parsed = JSON.parse(content) as {
      documentType: string;
      confidence: number;
      summary: string;
      keyInfo: Record<string, unknown>;
    };

    return {
      ...parsed,
      model: this.model,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    };
  }
}
