import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi, requireVnProxyCapability } from './api.js';
import { formatToolResult } from '../types.js';

const MarketNewsInputSchema = z.object({
  query: z
    .string()
    .default('')
    .describe('Optional query for market news search. Leave empty to fetch trending VN market headlines.'),
  mode: z
    .enum(['balanced', 'strict'])
    .default('balanced')
    .describe('News relevance mode. balanced improves recall; strict keeps only tighter market/trading headlines.'),
  limit: z.number().default(5).describe('Maximum number of articles to return (default: 5, max: 20).'),
});

export const VN_MARKET_NEWS_DESCRIPTION = `
Fetches Vietnam market-wide news through the local Silver-capable proxy.

If a query is provided, the tool performs a keyword search. If the query is empty, it returns market-wide headlines in the selected relevance mode.

Use this for market context, not for ticker-specific catalysts. For a single stock, prefer \`vn_company_news\`.
`;

export const getMarketNewsVn = new DynamicStructuredTool({
  name: 'vn_market_news',
  description: 'Fetches strict VN market headlines or searches VN market news by query.',
  schema: MarketNewsInputSchema,
  func: async (input) => {
    await requireVnProxyCapability('news');
    const endpoint = input.query.trim() ? '/news/search/' : '/news/trending/';
    const params = input.query.trim()
      ? { query: input.query.trim(), mode: input.mode, limit: Math.min(input.limit, 20) }
      : { mode: input.mode, limit: Math.min(input.limit, 20) };
    const { data, url } = await callApi(endpoint, params);
    return formatToolResult((data.news as unknown[]) || [], [url]);
  },
});
