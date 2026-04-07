import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi, requireVnProxyCapability } from './api.js';
import { formatToolResult } from '../types.js';

const TechnicalSignalSnapshotInputSchema = z.object({
  ticker: z.string().describe("VN ticker symbol to analyze. For example, 'FPT'."),
  lookback_days: z.number().default(180).describe('Price-history lookback window in days (default: 180).'),
});

export const VN_TECHNICAL_SIGNAL_SNAPSHOT_DESCRIPTION = `
Fetches a compact VN technical signal snapshot through the local Silver-capable proxy.

Use this when you want the latest directional read quickly without requesting full indicator series.
`;

export const getTechnicalSignalSnapshotVn = new DynamicStructuredTool({
  name: 'vn_technical_signal_snapshot',
  description: 'Fetches a compact VN technical signal snapshot such as RSI state and price-vs-moving-average context.',
  schema: TechnicalSignalSnapshotInputSchema,
  func: async (input) => {
    await requireVnProxyCapability('technical_analysis');
    const { data, url } = await callApi('/technical/signal-snapshot/', {
      ticker: input.ticker.toUpperCase(),
      lookback_days: input.lookback_days,
    });
    return formatToolResult((data.signals as Record<string, unknown>) || data, [url]);
  },
});
