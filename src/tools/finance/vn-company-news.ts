import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi, requireVnProxyCapability } from './api.js';
import { formatToolResult } from '../types.js';

const CompanyNewsInputSchema = z.object({
  ticker: z.string().describe("VN ticker symbol to fetch company news for. For example, 'FPT'."),
  limit: z.number().default(5).describe('Maximum number of articles to return (default: 5, max: 20).'),
});

export const VN_COMPANY_NEWS_DESCRIPTION = `
Fetches recent VN company news for a single ticker through the local Silver-capable proxy.

Use this for ticker-specific catalysts, press coverage, and corporate developments in the Vietnam market.
`;

export const getCompanyNewsVn = new DynamicStructuredTool({
  name: 'vn_company_news',
  description: 'Fetches recent VN company news for a ticker from the local proxy.',
  schema: CompanyNewsInputSchema,
  func: async (input) => {
    await requireVnProxyCapability('news');
    const { data, url } = await callApi('/news/company/', {
      ticker: input.ticker.toUpperCase(),
      limit: Math.min(input.limit, 20),
    });

    return formatToolResult((data.news as unknown[]) || [], [url]);
  },
});
