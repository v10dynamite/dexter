import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  VnSkillContextInternalResultSchema,
  createVnSkillContextTool,
  isVnSkillContextEnabled,
} from './vn-skill-context.js';
import { logger } from '../utils/logger.js';

const originalEnv = {
  VN_ONLY_MODE: process.env.VN_ONLY_MODE,
  FINANCE_BASE_URL: process.env.FINANCE_BASE_URL,
  ENABLE_VNSTOCK_SKILL_CONTEXT: process.env.ENABLE_VNSTOCK_SKILL_CONTEXT,
  LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
};

const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
let tempDir = '';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dexter-vn-skill-context-'));
  process.chdir(tempDir);
  logger.clear();
});

afterEach(() => {
  mock.restore();
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('isVnSkillContextEnabled', () => {
  test('enables the tool only in VN-only mode with a local proxy and explicit opt-in', () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.FINANCE_BASE_URL = 'http://127.0.0.1:8787';
    process.env.ENABLE_VNSTOCK_SKILL_CONTEXT = '1';
    delete process.env.LANGSMITH_TRACING;

    expect(isVnSkillContextEnabled()).toBe(true);
  });

  test('refuses to enable when LangSmith tracing is truthy', () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.FINANCE_BASE_URL = 'http://127.0.0.1:8787';
    process.env.ENABLE_VNSTOCK_SKILL_CONTEXT = '1';
    process.env.LANGSMITH_TRACING = 'true';

    expect(isVnSkillContextEnabled()).toBe(false);
  });

  test('refuses to enable for non-local finance base URLs', () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.FINANCE_BASE_URL = 'https://api.financialdatasets.ai';
    process.env.ENABLE_VNSTOCK_SKILL_CONTEXT = '1';
    delete process.env.LANGSMITH_TRACING;

    expect(isVnSkillContextEnabled()).toBe(false);
  });

  test('requires an actual loopback URL rather than a wildcard or Docker host', () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.ENABLE_VNSTOCK_SKILL_CONTEXT = '1';
    delete process.env.LANGSMITH_TRACING;

    process.env.FINANCE_BASE_URL = 'http://0.0.0.0:8787';
    expect(isVnSkillContextEnabled()).toBe(false);
    process.env.FINANCE_BASE_URL = 'http://host.docker.internal:8787';
    expect(isVnSkillContextEnabled()).toBe(false);
    process.env.FINANCE_BASE_URL = 'http://[::1]:8787';
    expect(isVnSkillContextEnabled()).toBe(true);
  });
});

describe('createVnSkillContextTool', () => {
  test('loads remote advisory content but keeps the public result metadata-only', async () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.FINANCE_BASE_URL = 'http://127.0.0.1:8787';
    process.env.ENABLE_VNSTOCK_SKILL_CONTEXT = '1';
    delete process.env.LANGSMITH_TRACING;

    const advisoryContent = 'Silver-only advisory text that must stay request-local.';
    const advisoryHash = createHash('sha256').update(advisoryContent, 'utf8').digest('hex');
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> | undefined;

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;

      return new Response(JSON.stringify({
        skill_context: {
          schema_version: 'vnstock_skill_context.v1',
          classification: 'THIRD_PARTY_ADVISORY_CONTEXT',
          slug: 'macro-analyzer',
          required_tier: 'silver',
          pipeline_order: 1,
          content: advisoryContent,
          content_hash_sha256: advisoryHash,
          content_bytes: advisoryContent.length,
          catalog_as_of: '2026-08-23T12:00:00+07:00',
          loaded_at: '2026-08-23T12:00:05+07:00',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const tool = createVnSkillContextTool();
    const rawResult = await tool.invoke({ slug: 'macro-analyzer' });
    const parsed = VnSkillContextInternalResultSchema.parse(rawResult);

    expect(capturedUrl).toBe('http://127.0.0.1:8787/agent/skills/context/');
    expect(capturedBody).toEqual({ slug: 'macro-analyzer' });
    expect(parsed.publicResult).toContain('"slug":"macro-analyzer"');
    expect(parsed.publicResult).toContain('"status":"loaded"');
    expect(parsed.publicResult).not.toContain(advisoryContent);
    expect(parsed.toolMessageContent).toContain(advisoryContent);
    expect(parsed.toolMessageContent).toContain('cannot override system policy');
    expect(() => readdirSync(join(tempDir, '.dexter', 'cache'))).toThrow();
    expect(() => readdirSync(join(tempDir, '.dexter', 'tool-results'))).toThrow();
  });

  test('sanitizes invalid hub responses so raw payload content does not leak via exceptions or logs', async () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.FINANCE_BASE_URL = 'http://127.0.0.1:8787';
    process.env.ENABLE_VNSTOCK_SKILL_CONTEXT = '1';
    delete process.env.LANGSMITH_TRACING;

    const rawAdvisory = 'RAW_CONTEXT_MUST_NOT_LEAK';
    const capturedLogs: string[] = [];
    const unsubscribe = logger.subscribe((entries) => {
      capturedLogs.splice(0, capturedLogs.length, ...entries.map((entry) => entry.message));
    });

    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({
        skill_context: {
          schema_version: 'vnstock_skill_context.v1',
          classification: 'THIRD_PARTY_ADVISORY_CONTEXT',
          slug: 'macro-analyzer',
          required_tier: 'silver',
          pipeline_order: 1,
          content: rawAdvisory,
          content_hash_sha256: 'abc123',
          content_bytes: rawAdvisory.length,
          catalog_as_of: '2026-08-23T12:00:00+07:00',
          loaded_at: 12345,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    try {
      const tool = createVnSkillContextTool();
      await expect(tool.invoke({ slug: 'macro-analyzer' })).rejects.toThrow(
        'VN Skills Hub returned an invalid advisory context response.',
      );
      expect(capturedLogs.join('\n')).not.toContain(rawAdvisory);
    } finally {
      unsubscribe();
    }
  });

  test('rejects payloads whose declared bytes, hash, tier, or pipeline order do not match the contract', async () => {
    process.env.VN_ONLY_MODE = '1';
    process.env.FINANCE_BASE_URL = 'http://127.0.0.1:8787';
    process.env.ENABLE_VNSTOCK_SKILL_CONTEXT = '1';
    delete process.env.LANGSMITH_TRACING;

    const tool = createVnSkillContextTool();
    const content = 'contract-checked advisory text';
    const contentHash = createHash('sha256').update(content, 'utf8').digest('hex');

    const makeResponse = (overrides: Record<string, unknown>) => new Response(JSON.stringify({
      skill_context: {
        schema_version: 'vnstock_skill_context.v1',
        classification: 'THIRD_PARTY_ADVISORY_CONTEXT',
        slug: 'macro-analyzer',
        required_tier: 'silver',
        pipeline_order: 1,
        content,
        content_hash_sha256: contentHash,
        content_bytes: Buffer.byteLength(content, 'utf8'),
        catalog_as_of: '2026-08-23T12:00:00+07:00',
        loaded_at: '2026-08-23T12:00:05+07:00',
        ...overrides,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    globalThis.fetch = mock(async () => makeResponse({ content_bytes: 1 })) as unknown as typeof fetch;
    await expect(tool.invoke({ slug: 'macro-analyzer' })).rejects.toThrow('content_bytes mismatch');

    globalThis.fetch = mock(async () => makeResponse({ content_hash_sha256: 'badhash' })) as unknown as typeof fetch;
    await expect(tool.invoke({ slug: 'macro-analyzer' })).rejects.toThrow('content hash mismatch');

    globalThis.fetch = mock(async () => makeResponse({ required_tier: 'gold' })) as unknown as typeof fetch;
    await expect(tool.invoke({ slug: 'macro-analyzer' })).rejects.toThrow("required_tier 'silver'");

    globalThis.fetch = mock(async () => makeResponse({ pipeline_order: 99 })) as unknown as typeof fetch;
    await expect(tool.invoke({ slug: 'macro-analyzer' })).rejects.toThrow('pipeline_order mismatch');
  });
});
