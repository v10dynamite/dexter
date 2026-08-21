import { afterEach, describe, expect, mock, test } from 'bun:test';
import { getDecisionSignalsVn } from './vn-decision-signals.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('vn_decision_signals', () => {
  test('reads a ticker signal without forwarding caller gate fields', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ opportunity_signal: { ticker: 'FPT', planning_authority: 'REVIEW_ONLY' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const result = await getDecisionSignalsVn.invoke({
      mode: 'ticker',
      ticker: 'fpt',
      trading_gate: 'GO',
      freshness_state: 'STALE',
    });

    expect(capturedBody?.ticker).toBe('FPT');
    expect(capturedBody).not.toHaveProperty('gate_context');
    expect(String(result)).toContain('REVIEW_ONLY');
  });

  test('strips attempted caller gate fields from the schema and request body', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ opportunity_signal: { ticker: 'FPT', planning_authority: 'REVIEW_ONLY' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const parsed = getDecisionSignalsVn.schema.parse({
      mode: 'ticker',
      ticker: 'fpt',
      gate_context: { trading_gate: 'GO', freshness_state: 'FRESH' },
      trading_gate: 'GO',
      freshness_state: 'FRESH',
    } as unknown);

    expect(parsed).toEqual({ mode: 'ticker', ticker: 'fpt', limit: 100 });

    await getDecisionSignalsVn.invoke({
      mode: 'ticker',
      ticker: 'fpt',
      gate_context: { trading_gate: 'GO', freshness_state: 'FRESH' },
      trading_gate: 'GO',
      freshness_state: 'FRESH',
    } as unknown as Record<string, unknown>);

    expect(capturedBody).toEqual({ ticker: 'FPT' });
  });

  test('reads the persisted inbox without triggering a scan', async () => {
    let capturedUrl = '';
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ schema_version: 'opportunity_signal_inbox.v1', signals: [], transitions: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await getDecisionSignalsVn.invoke({ mode: 'inbox', maturity: 'CONFIRMED', limit: 25 });

    expect(capturedUrl).toContain('/decision/signals/inbox/');
    expect(capturedUrl).toContain('maturity=CONFIRMED');
    expect(capturedUrl).toContain('limit=25');
  });
});
