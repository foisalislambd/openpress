import { Injectable, OnModuleInit } from '@nestjs/common';
import { HooksService } from '../hooks/hooks.service';

export interface AssistantRequest {
  prompt: string;
  context?: string;
}

/**
 * Default assistant is a stub so tests and local sites run without an API key.
 * Set AI_PROVIDER=openai and OPENAI_API_KEY to call that API. Plugins can
 * replace the result with the `assistant.complete` filter.
 */
@Injectable()
export class AssistantService implements OnModuleInit {
  constructor(private hooks: HooksService) {}

  onModuleInit() {
    this.hooks.addFilter('assistant.complete', (value) => this.provide(value), 1);
  }

  complete(input: AssistantRequest) {
    return this.hooks.applyFilters('assistant.complete', input);
  }

  private async provide(value: unknown) {
    const input = (value ?? {}) as AssistantRequest;
    const prompt = String(input.prompt ?? '').slice(0, 4000);
    const provider = (process.env.AI_PROVIDER || 'stub').toLowerCase();
    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You help edit an OpenPress site. Reply in plain text.' },
            { role: 'user', content: input.context ? `${input.context}\n\n${prompt}` : prompt },
          ],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const text = payload.choices?.[0]?.message?.content;
        if (text) return { provider: 'openai', text };
      }
    }
    return {
      provider: 'stub',
      text: prompt
        ? `Stub assistant (no paid API key required). You asked: ${prompt.slice(0, 240)}`
        : 'Stub assistant is ready. Ask a question about this site.',
    };
  }
}
