import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { DEFAULT_MODEL } from './ai.constants.js';
import { ANALYSIS_SYSTEM_PROMPT } from './prompts/analysis.system.js';
import { ANALYSIS_JSON_SCHEMA } from './schemas/analysis.schema.js';

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
