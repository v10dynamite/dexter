import { afterEach, describe, expect, test } from 'bun:test';
import { isVnNewsToolsEnabled, isVnTechnicalToolsEnabled } from './finance/api.js';
import { getToolRegistry } from './registry.js';

const originalEnv = {
  VN_ONLY_MODE: process.env.VN_ONLY_MODE,
  ENABLE_VNSTOCK_NEWS: process.env.ENABLE_VNSTOCK_NEWS,
  ENABLE_VNSTOCK_TA: process.env.ENABLE_VNSTOCK_TA,
  ENABLE_HOUSEHOLD_TOOLS: process.env.ENABLE_HOUSEHOLD_TOOLS,
  ENABLE_VN_EXTENDED_TOOLS: process.env.ENABLE_VN_EXTENDED_TOOLS,
  FINANCE_BASE_URL: process.env.FINANCE_BASE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('VN Silver env gating', () => {
  test('enables VN news and technical tools only in VN-only mode', () => {
    delete process.env.VN_ONLY_MODE;
    process.env.ENABLE_VNSTOCK_NEWS = '1';
    process.env.ENABLE_VNSTOCK_TA = '1';

    expect(isVnNewsToolsEnabled()).toBe(false);
    expect(isVnTechnicalToolsEnabled()).toBe(false);

    process.env.VN_ONLY_MODE = '1';
    expect(isVnNewsToolsEnabled()).toBe(true);
    expect(isVnTechnicalToolsEnabled()).toBe(true);
  });

  test('adds VN Silver tools to the registry when enabled', () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.ENABLE_VN_EXTENDED_TOOLS = '1';
    process.env.ENABLE_VNSTOCK_NEWS = '1';
    process.env.ENABLE_VNSTOCK_TA = '1';
    process.env.FINANCE_BASE_URL = 'http://127.0.0.1:8787';

    const names = getToolRegistry('gpt-5.4').map((tool) => tool.name);

    expect(names).toContain('vn_smart_money');
    expect(names).toContain('vn_company_events');
    expect(names).toContain('vn_market_valuation');
    expect(names).toContain('vn_company_news');
    expect(names).toContain('vn_market_news');
    expect(names).toContain('vn_news_topics');
    expect(names).toContain('vn_technical_indicators');
    expect(names).toContain('vn_technical_signal_snapshot');
    expect(names).toContain('household_fhsc_latest');
    expect(names).toContain('household_fhsc_trades');
  });
});
