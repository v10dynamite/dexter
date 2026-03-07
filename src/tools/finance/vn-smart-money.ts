import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const SmartMoneyInputSchema = z.object({
  ticker: z
    .string()
    .describe("The VN stock ticker symbol to fetch smart-money and insider flow snapshots for. For example, 'FPT' for FPT."),
});

export const VN_SMART_MONEY_DESCRIPTION = `
Fetches VN smart-money snapshots for a single ticker from the local data proxy, including foreign and proprietary flow components.

Use this when analyzing short-term liquidity pressure, block trades, and capital movement signals.
`;

export const getSmartMoney = new DynamicStructuredTool({
  name: 'vn_smart_money',
  description: 'Fetches foreign and proprietary trading flow snapshots for a VN ticker.',
  schema: SmartMoneyInputSchema,
  func: async (input) => {
    const { data, url } = await callApi('/trading/smart-money/', {
      ticker: input.ticker.toUpperCase(),
    });

    return formatToolResult(data.smart_money || data, [url]);
  },
});

