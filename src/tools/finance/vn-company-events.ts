import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi } from './api.js';
import { formatToolResult } from '../types.js';

const CompanyEventsInputSchema = z.object({
  ticker: z.string().describe("VN ticker symbol to fetch corporate events for. For example, 'FPT'."),
});

export const VN_COMPANY_EVENTS_DESCRIPTION = `
Fetches upcoming and historical company events for a VN ticker from the local proxy.

Typical events include dividend declarations and shareholder meetings. Use this for event risk checks and position sizing adjustments.
`;

export const getCompanyEvents = new DynamicStructuredTool({
  name: 'vn_company_events',
  description: 'Fetches corporate events (dividend meetings, AGMs, etc.) for a VN ticker.',
  schema: CompanyEventsInputSchema,
  func: async (input) => {
    const { data, url } = await callApi('/company/events/', {
      ticker: input.ticker.toUpperCase(),
    });

    return formatToolResult(data.events || data, [url]);
  },
});

