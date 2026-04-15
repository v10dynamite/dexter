import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const HouseholdFhscTradesInputSchema = z.object({
  owner_id: z.string().describe("Owner id in household ledger. For example, 'father'."),
  account_id: z.string().optional().describe("Optional FHSC account id. For example, '0001216378'."),
  limit: z.coerce.number().int().min(1).max(200).default(20).describe('Maximum number of rows to return (default: 20, max: 200).'),
});

export const HOUSEHOLD_FHSC_TRADES_DESCRIPTION = `
Fetches read-only FHSC trade history already synchronized into household ledger DB.

Use this to review recent executed transactions without navigating FHSC web manually.
`;

export const getHouseholdFhscTrades = new DynamicStructuredTool({
  name: 'household_fhsc_trades',
  description: 'Fetches synchronized FHSC trade history rows from household ledger DB.',
  schema: HouseholdFhscTradesInputSchema,
  func: async (input) => {
    const { data, url } = await callApi('/household/fhsc/trades/', {
      owner_id: input.owner_id,
      account_id: input.account_id,
      limit: Math.min(Math.max(1, input.limit), 200),
    });
    return formatToolResult((data.rows as unknown[]) || data, [url]);
  },
});
