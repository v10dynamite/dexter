import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AIMessage } from '@langchain/core/messages';
import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createRunContext } from './run-context.js';
import { AgentToolExecutor } from './tool-executor.js';

const originalCwd = process.cwd();
let tempDir = '';

afterEach(() => {
  process.chdir(originalCwd);
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = '';
  }
});

describe('AgentToolExecutor VN advisory policy', () => {
  test('records only public metadata in scratchpad and denies non-VN tools after a successful load', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'dexter-vn-executor-'));
    process.chdir(tempDir);

    const rawAdvisory = 'REQUEST_LOCAL_ONLY_SILVER_CONTEXT';
    const vnTool = new DynamicStructuredTool({
      name: 'vn_skill_context',
      description: 'test',
      schema: z.object({ slug: z.enum(['macro-analyzer']) }),
      func: async () => ({
        __dexterInternalToolResult: 'vn_skill_context.v1',
        publicResult: JSON.stringify({
          slug: 'macro-analyzer',
          content_hash_sha256: 'hash-1',
          content_bytes: rawAdvisory.length,
          status: 'loaded',
        }),
        toolMessageContent: `Wrapped advisory\n\n${rawAdvisory}`,
        advisoryContextActivated: true,
      }),
    });
    const webSearchTool = new DynamicStructuredTool({
      name: 'web_search',
      description: 'test',
      schema: z.object({ query: z.string() }),
      func: async () => 'should never run',
    });

    const toolMap = new Map<string, StructuredToolInterface>([
      ['vn_skill_context', vnTool],
      ['web_search', webSearchTool],
    ]);
    const concurrencyMap = new Map([
      ['vn_skill_context', false],
      ['web_search', true],
    ]);

    const executor = new AgentToolExecutor(toolMap, concurrencyMap);
    const ctx = createRunContext('load remote advisory context');

    const firstResponse = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'call-1', name: 'vn_skill_context', args: { slug: 'macro-analyzer' } },
      ],
    });

    const firstEvents = [];
    for await (const event of executor.executeAll(firstResponse, ctx)) {
      firstEvents.push(event);
    }

    expect(firstEvents.map((event) => event.type)).toEqual(['tool_start', 'tool_end']);
    const toolEnd = firstEvents[1];
    if (toolEnd.type !== 'tool_end') {
      throw new Error('expected tool_end event');
    }
    expect(toolEnd.result).toContain('"slug":"macro-analyzer"');
    expect(toolEnd.result).not.toContain(rawAdvisory);
    expect(JSON.stringify(toolEnd)).not.toContain(rawAdvisory);
    expect(ctx.privateToolMessageContent.get('call-1')).toContain(rawAdvisory);

    const scratchpadRecords = ctx.scratchpad.getToolCallRecords();
    expect(scratchpadRecords).toHaveLength(1);
    expect(scratchpadRecords[0]?.result).toContain('"status":"loaded"');
    expect(scratchpadRecords[0]?.result).not.toContain(rawAdvisory);

    const scratchpadPath = (ctx.scratchpad as unknown as { filepath: string }).filepath;
    const scratchpadContent = await Bun.file(scratchpadPath).text();
    expect(scratchpadContent).not.toContain(rawAdvisory);
    expect(() => readdirSync(join(tempDir, '.dexter', 'tool-results'))).toThrow();

    const secondResponse = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'call-2', name: 'web_search', args: { query: 'forbidden after advisory load' } },
      ],
    });

    const secondEvents = [];
    for await (const event of executor.executeAll(secondResponse, ctx)) {
      secondEvents.push(event);
    }

    expect(secondEvents.map((event) => event.type)).toEqual(['tool_denied']);
  });

  test('permits approved VN proxy tools after load and leaves policy unchanged when hub loading fails', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'dexter-vn-executor-'));
    process.chdir(tempDir);

    const makeTool = (name: string) => new DynamicStructuredTool({
      name,
      description: 'test',
      schema: z.object({}).passthrough(),
      func: async () => `${name}:ok`,
    });

    const successfulContext = new DynamicStructuredTool({
      name: 'vn_skill_context',
      description: 'test',
      schema: z.object({ slug: z.enum(['macro-analyzer']) }),
      func: async () => ({
        __dexterInternalToolResult: 'vn_skill_context.v1',
        publicResult: JSON.stringify({
          slug: 'macro-analyzer',
          content_hash_sha256: 'hash-1',
          content_bytes: 7,
          status: 'loaded',
        }),
        toolMessageContent: 'private advisory',
        advisoryContextActivated: true,
      }),
    });

    const toolNames = [
      'get_financials',
      'get_market_data',
      'household_fhsc_latest',
      'bash',
      'write_file',
      'edit_file',
      'cron',
      'memory_search',
      'browser',
      'web_search',
    ] as const;
    const toolMap = new Map<string, StructuredToolInterface>([
      ['vn_skill_context', successfulContext],
      ...toolNames.map((name): [string, StructuredToolInterface] => [name, makeTool(name)]),
    ]);
    const concurrencyMap = new Map<string, boolean>([
      ['vn_skill_context', false],
      ...toolNames.map((name): [string, boolean] => [name, true]),
    ]);

    const executor = new AgentToolExecutor(toolMap, concurrencyMap);
    const ctx = createRunContext('policy test');

    for await (const _event of executor.executeAll(new AIMessage({
      content: '',
      tool_calls: [{ id: 'load-1', name: 'vn_skill_context', args: { slug: 'macro-analyzer' } }],
    }), ctx)) {
      // load context
    }

    const allowedEvents = [];
    for await (const event of executor.executeAll(new AIMessage({
      content: '',
      tool_calls: [
        { id: 'allow-1', name: 'get_financials', args: { query: 'FPT revenue' } },
        { id: 'allow-2', name: 'get_market_data', args: { query: 'FPT price' } },
      ],
    }), ctx)) {
      allowedEvents.push(event);
    }

    expect(allowedEvents.filter((event) => event.type === 'tool_start').map((event) => event.tool).sort()).toEqual([
      'get_financials',
      'get_market_data',
    ]);
    expect(allowedEvents.filter((event) => event.type === 'tool_end').map((event) => event.tool).sort()).toEqual([
      'get_financials',
      'get_market_data',
    ]);

    for (const deniedTool of ['household_fhsc_latest', 'bash', 'write_file', 'edit_file', 'cron', 'memory_search', 'browser', 'web_search']) {
      const deniedEvents = [];
      for await (const event of executor.executeAll(new AIMessage({
        content: '',
        tool_calls: [{ id: `deny-${deniedTool}`, name: deniedTool, args: {} }],
      }), ctx)) {
        deniedEvents.push(event);
      }
      expect(deniedEvents.map((event) => event.type)).toEqual(['tool_denied']);
    }

    const failingContext = new DynamicStructuredTool({
      name: 'vn_skill_context',
      description: 'test',
      schema: z.object({ slug: z.enum(['macro-analyzer']) }),
      func: async () => {
        throw new Error('Hub unavailable.');
      },
    });
    const failureExecutor = new AgentToolExecutor(
      new Map([
        ['vn_skill_context', failingContext],
        ['web_search', makeTool('web_search') as StructuredToolInterface],
      ]),
      new Map([
        ['vn_skill_context', false],
        ['web_search', true],
      ]),
    );
    const failureCtx = createRunContext('hub failure');

    const failureEvents = [];
    for await (const event of failureExecutor.executeAll(new AIMessage({
      content: '',
      tool_calls: [{ id: 'fail-1', name: 'vn_skill_context', args: { slug: 'macro-analyzer' } }],
    }), failureCtx)) {
      failureEvents.push(event);
    }
    expect(failureEvents.map((event) => event.type)).toEqual(['tool_start', 'tool_error']);

    const postFailureEvents = [];
    for await (const event of failureExecutor.executeAll(new AIMessage({
      content: '',
      tool_calls: [{ id: 'fail-2', name: 'web_search', args: { query: 'still allowed' } }],
    }), failureCtx)) {
      postFailureEvents.push(event);
    }
    expect(postFailureEvents.map((event) => event.type)).toEqual(['tool_start', 'tool_end']);
  });

  test('makes vn_skill_context the sole call in its iteration and skips duplicate slug loads', () => {
    const executor = new AgentToolExecutor(new Map(), new Map());
    const ctx = createRunContext('skip policy');

    const firstPrepared = executor.prepareExecution(new AIMessage({
      content: '',
      tool_calls: [
        { id: 'context-1', name: 'vn_skill_context', args: { slug: 'macro-analyzer' } },
        { id: 'market-1', name: 'get_market_data', args: { query: 'FPT price' } },
      ],
    }), ctx);

    expect(firstPrepared.calls.map((call) => call.name)).toEqual(['vn_skill_context']);
    expect(firstPrepared.skippedToolMessages.get('market-1')).toContain('sole tool call');

    const secondPrepared = executor.prepareExecution(new AIMessage({
      content: '',
      tool_calls: [
        { id: 'context-2', name: 'vn_skill_context', args: { slug: 'macro-analyzer' } },
      ],
    }), ctx);

    expect(secondPrepared.calls).toHaveLength(0);
    expect(secondPrepared.skippedToolMessages.get('context-2')).toContain('only be loaded once per query');
  });
});
