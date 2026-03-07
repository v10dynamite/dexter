import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

export const VN_MARKET_VALUATION_DESCRIPTION = `
Fetches VN market-wide valuation metrics, including VNINDEX P/E and P/B, from the local proxy.

Use this tool for risk-off screens, market regime checks, and valuation context when deciding position sizing.
`;

export const getMarketValuation = new DynamicStructuredTool({
  name: 'vn_market_valuation',
  description: 'Fetches VNINDEX-wide valuation snapshots (P/E, P/B) from the local proxy.',
  schema: z.object({}),
  func: async () => {
    const { data, url } = await callApi('/market/valuation/', {});

    return formatToolResult(data.valuation || data, [url]);
  },
});

