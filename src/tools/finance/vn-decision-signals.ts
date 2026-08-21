import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { api } from './api.js';
import { formatToolResult } from '../types.js';

const DecisionSignalsInputSchema = z.object({
  mode: z.enum(['ticker', 'inbox']).default('ticker'),
  ticker: z.string().optional().describe("VN ticker for ticker mode, for example 'FPT'. Optional inbox filter."),
  maturity: z.enum(['DISCOVERY', 'CONFIRMED']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const VN_DECISION_SIGNALS_DESCRIPTION = `
Reads evidence-backed VN opportunity signals from the local proxy.

Use ticker mode for a fresh, ad-hoc analysis. Use inbox mode to inspect persisted
signal states and transitions. Signals are review-only unless their explicit
planning_authority says ENTRY_PLAN_ALLOWED; this tool never executes broker actions.
`;

export const getDecisionSignalsVn = new DynamicStructuredTool({
  name: 'vn_decision_signals',
  description: 'Reads VN opportunity signals and their planning authority; never places orders.',
  schema: DecisionSignalsInputSchema,
  func: async (input) => {
    if (input.mode === 'inbox') {
      const { data, url } = await api.get('/decision/signals/inbox/', {
        ticker: input.ticker?.toUpperCase(),
        maturity: input.maturity,
        limit: input.limit,
      });
      return formatToolResult(data, [url]);
    }

    if (!input.ticker) {
      throw new Error('ticker is required when mode=ticker');
    }
    const { data, url } = await api.post('/decision/signals/', {
      ticker: input.ticker.toUpperCase(),
    });
    return formatToolResult(data.opportunity_signal || data, [url]);
  },
});
