import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const MarketDiscoveryInputSchema = z.object({
  mode: z.enum(['latest', 'regime']).default('latest'),
});

export const VN_MARKET_DISCOVERY_DESCRIPTION = `
Reads the latest persisted VN market discovery or market regime snapshot from the local proxy.

Use latest mode for the most recent full-flow discovery packet. Use regime mode for the
latest market regime evidence. This tool is strictly read-only: it never starts scans,
refreshes gates, or grants planning authority.
`;

export const getMarketDiscoveryVn = new DynamicStructuredTool({
  name: 'vn_market_discovery',
  description: 'Reads the latest persisted VN market discovery or market regime snapshot; never starts scans.',
  schema: MarketDiscoveryInputSchema,
  func: async (input) => {
    const endpoint = input.mode === 'regime' ? '/market/regime/latest/' : '/market/discovery/latest/';
    const { data, url } = await callApi(endpoint, {});
    return formatToolResult(data, [url]);
  },
});
