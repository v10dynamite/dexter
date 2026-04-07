import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi, requireVnProxyCapability } from './api.js';
import { formatToolResult } from '../types.js';

const TechnicalIndicatorsInputSchema = z.object({
  ticker: z.string().describe("VN ticker symbol to analyze. For example, 'FPT'."),
  indicator: z
    .enum(['sma', 'ema', 'rsi', 'macd', 'bollinger_bands', 'vwap'])
    .describe('Technical indicator to compute.'),
  lookback_days: z.number().default(180).describe('Price-history lookback window in days (default: 180).'),
  window: z.number().optional().describe('Window size for SMA, EMA, RSI, and Bollinger Bands.'),
  fast: z.number().optional().describe('Fast EMA period for MACD.'),
  slow: z.number().optional().describe('Slow EMA period for MACD.'),
  signal: z.number().optional().describe('Signal period for MACD.'),
  std_dev: z.number().optional().describe('Standard deviation multiplier for Bollinger Bands.'),
});

export const VN_TECHNICAL_INDICATORS_DESCRIPTION = `
Computes VN technical indicators through the local Silver-capable proxy.

Use this for trend, momentum, and signal checks on VN tickers without leaving the local proxy flow.
`;

export const getTechnicalIndicatorsVn = new DynamicStructuredTool({
  name: 'vn_technical_indicators',
  description: 'Computes VN technical indicators such as RSI, MACD, SMA, EMA, Bollinger Bands, and VWAP.',
  schema: TechnicalIndicatorsInputSchema,
  func: async (input) => {
    await requireVnProxyCapability('technical_analysis');
    const { data, url } = await callApi('/technical/indicators/', {
      ticker: input.ticker.toUpperCase(),
      indicator: input.indicator,
      lookback_days: input.lookback_days,
      window: input.window,
      fast: input.fast,
      slow: input.slow,
      signal: input.signal,
      std_dev: input.std_dev,
    });

    return formatToolResult((data.indicator as Record<string, unknown>) || data, [url]);
  },
});
