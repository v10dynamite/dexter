import { afterEach, describe, expect, mock, test } from 'bun:test';
import { getMarketDiscoveryVn } from './vn-market-discovery.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('vn_market_discovery', () => {
  test('reads the latest persisted market discovery packet without triggering a scan', async () => {
    let capturedUrl = '';
    let capturedMethod = 'GET';
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = String(init?.method || 'GET');
      return new Response(
        JSON.stringify({
          schema_version: 'market_discovery.v1',
          summary: { shortlist_count: 30 },
          trace_id: 'trace-discovery-1',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as unknown as typeof fetch;

    const result = await getMarketDiscoveryVn.invoke({
      mode: 'latest',
      start_scan: true,
      gate_context: { trading_gate: 'GO' },
    } as unknown as Record<string, unknown>);

    expect(capturedMethod).toBe('GET');
    expect(capturedUrl).toContain('/market/discovery/latest/');
    expect(capturedUrl).not.toContain('scan');
    expect(capturedUrl).not.toContain('gate');
    expect(JSON.parse(String(result))).toEqual({
      data: {
        schema_version: 'market_discovery.v1',
        summary: { shortlist_count: 30 },
        trace_id: 'trace-discovery-1',
      },
      sourceUrls: [capturedUrl],
    });
  });

  test('reads the latest persisted market regime snapshot', async () => {
    let capturedUrl = '';
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return new Response(
        JSON.stringify({
          schema_version: 'market_regime.v2',
          label: 'SUPPORTIVE',
          confidence: 0.74,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as unknown as typeof fetch;

    const result = await getMarketDiscoveryVn.invoke({ mode: 'regime' });

    expect(capturedUrl).toContain('/market/regime/latest/');
    expect(JSON.parse(String(result))).toEqual({
      data: {
        schema_version: 'market_regime.v2',
        label: 'SUPPORTIVE',
        confidence: 0.74,
      },
      sourceUrls: [capturedUrl],
    });
  });

  test('strips caller attempts to pass scan or gate fields through the schema', () => {
    const parsed = getMarketDiscoveryVn.schema.parse({
      mode: 'latest',
      start_scan: true,
      gate_context: { trading_gate: 'GO', freshness_state: 'FRESH' },
      planning_authority: 'ENTRY_PLAN_ALLOWED',
    } as unknown);

    expect(parsed).toEqual({ mode: 'latest' });
  });

  test('surfaces proxy error code and message for EOD readiness failures', async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'EOD_DATA_INCOMPLETE',
            message: 'Official packet is not ready before EOD completes.',
          },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as unknown as typeof fetch;

    await expect(getMarketDiscoveryVn.invoke({ mode: 'latest' })).rejects.toThrow(
      'EOD_DATA_INCOMPLETE: Official packet is not ready before EOD completes.',
    );
  });
});
