import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi, requireVnProxyCapability } from './api.js';
import { formatToolResult } from '../types.js';

const NewsTopicsInputSchema = z.object({
  mode: z
    .enum(['balanced', 'strict'])
    .default('balanced')
    .describe('Topic extraction mode. balanced improves recall; strict keeps only tighter market/trading themes.'),
  limit: z.number().default(10).describe('Maximum number of market topics to return (default: 10, max: 20).'),
});

export const VN_NEWS_TOPICS_DESCRIPTION = `
Extracts the dominant topics currently appearing in Vietnam market news through the local Silver-capable proxy.

Use this to quickly understand what themes are driving the market before drilling into individual articles.
`;

export const getNewsTopicsVn = new DynamicStructuredTool({
  name: 'vn_news_topics',
  description: 'Extracts dominant topics from recent VN market news.',
  schema: NewsTopicsInputSchema,
  func: async (input) => {
    await requireVnProxyCapability('news');
    const { data, url } = await callApi('/news/topics/', {
      mode: input.mode,
      limit: Math.min(input.limit, 20),
    });
    return formatToolResult((data.topics as unknown[]) || [], [url]);
  },
});
