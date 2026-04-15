import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const HouseholdFhscLatestInputSchema = z.object({
  owner_id: z.string().describe("Owner id in household ledger. For example, 'father'."),
  account_id: z.string().optional().describe("Optional FHSC account id. For example, '0001216378'."),
});

export const HOUSEHOLD_FHSC_LATEST_DESCRIPTION = `
Fetches the latest synchronized FHSC portfolio snapshot from household ledger DB.

Use this as the first source for owner-level NAV/allocation/equity context before asking the user for manual snapshots.
`;

export const getHouseholdFhscLatest = new DynamicStructuredTool({
  name: 'household_fhsc_latest',
  description: 'Fetches latest FHSC portfolio snapshot from household ledger DB.',
  schema: HouseholdFhscLatestInputSchema,
  func: async (input) => {
    const { data, url } = await callApi('/household/fhsc/latest/', {
      owner_id: input.owner_id,
      account_id: input.account_id,
    });
    return formatToolResult(data, [url]);
  },
});
