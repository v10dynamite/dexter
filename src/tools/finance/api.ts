import { readCache, writeCache, describeRequest } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { isVnOnlyMode, normalizeVnTicker } from './vn-only.js';

const DEFAULT_BASE_URL = 'https://api.financialdatasets.ai';
const VN_EXTENDED_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const LOCAL_PROXY_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal']);
const VN_PROXY_CAPABILITIES_TTL_MS = 5 * 60 * 1000;

export interface ApiResponse {
  data: Record<string, unknown>;
  url: string;
}

function isEnvEnabled(value: string | undefined): boolean {
  return VN_EXTENDED_ENABLED_VALUES.has(String(value || '').toLowerCase());
}

function isLocalProxyBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return LOCAL_PROXY_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isVnExtendedToolsEnabled(): boolean {
  if (!isVnOnlyMode()) {
    return false;
  }
  if (isEnvEnabled(process.env.ENABLE_VN_EXTENDED_TOOLS)) {
    return true;
  }
  const baseUrl = process.env.FINANCE_BASE_URL || DEFAULT_BASE_URL;
  return isLocalProxyBaseUrl(baseUrl);
}

export function isVnNewsToolsEnabled(): boolean {
  return isVnOnlyMode() && isEnvEnabled(process.env.ENABLE_VNSTOCK_NEWS);
}

export function isVnTechnicalToolsEnabled(): boolean {
  return isVnOnlyMode() && isEnvEnabled(process.env.ENABLE_VNSTOCK_TA);
}

export function isHouseholdToolsEnabled(): boolean {
  if (!isVnOnlyMode()) {
    return false;
  }
  if (isEnvEnabled(process.env.ENABLE_HOUSEHOLD_TOOLS)) {
    return true;
  }
  const baseUrl = process.env.FINANCE_BASE_URL || DEFAULT_BASE_URL;
  return isLocalProxyBaseUrl(baseUrl);
}

/**
 * Remove redundant fields from API payloads before they are returned to the LLM.
 * This reduces token usage while preserving the financial metrics needed for analysis.
 */
export function stripFieldsDeep(value: unknown, fields: readonly string[]): unknown {
  const fieldsToStrip = new Set(fields);

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(walk);
    }

    if (!node || typeof node !== 'object') {
      return node;
    }

    const record = node as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(record)) {
      if (fieldsToStrip.has(key)) {
        continue;
      }
      cleaned[key] = walk(child);
    }

    return cleaned;
  }

  return walk(value);
}

export type ApiParams = Record<string, string | number | string[] | undefined>;

interface ApiErrorDetail {
  code?: string;
  message?: string;
}

function getBaseUrl(): string {
  return process.env.FINANCE_BASE_URL || DEFAULT_BASE_URL;
}

function getApiKey(): string {
  return process.env.FINANCIAL_DATASETS_API_KEY || '';
}

export function normalizeApiParams(params: ApiParams): ApiParams {
  if (!isVnOnlyMode()) {
    return params;
  }

  const normalized: ApiParams = { ...params };
  if (typeof normalized.ticker === 'string') {
    normalized.ticker = normalizeVnTicker(normalized.ticker);
  }
  return normalized;
}

async function extractApiErrorDetail(response: Response): Promise<ApiErrorDetail | null> {
  try {
    const payload = (await response.clone().json()) as {
      error?: { code?: unknown; message?: unknown };
      code?: unknown;
      message?: unknown;
    };

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const nestedError = payload.error && typeof payload.error === 'object' ? payload.error : undefined;

    const code =
      typeof nestedError?.code === 'string'
        ? nestedError.code
        : typeof payload.code === 'string'
          ? payload.code
          : undefined;

    const message =
      typeof nestedError?.message === 'string'
        ? nestedError.message
        : typeof payload.message === 'string'
          ? payload.message
          : undefined;

    if (!code && !message) {
      return null;
    }

    return { code, message };
  } catch {
    return null;
  }
}

/**
 * Merge a follow-up page into the accumulated response. The API caps list
 * responses at a fixed page size, so record arrays are concatenated —
 * recursively, because /financials/ nests its three statement arrays one
 * level down. Scalars keep the first page's value; next_page_url is
 * excluded so it never reaches the cache, the formatters, or the LLM.
 */
function mergePage(accumulated: Record<string, unknown>, page: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(page)) {
    if (key === 'next_page_url') {
      continue;
    }
    const existing = accumulated[key];
    if (Array.isArray(existing) && Array.isArray(value)) {
      existing.push(...value);
    } else if (
      existing && value &&
      typeof existing === 'object' && typeof value === 'object' &&
      !Array.isArray(existing) && !Array.isArray(value)
    ) {
      mergePage(existing as Record<string, unknown>, value as Record<string, unknown>);
    }
  }
}

/**
 * Shared request execution: handles API key, error handling, logging, and response parsing.
 */
async function executeRequest(
  url: string,
  label: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey();

  if (!apiKey) {
    logger.warn(`[Financial Datasets API] call without key: ${label}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'x-api-key': apiKey,
        ...init.headers,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Financial Datasets API] network error: ${label} — ${message}`);
    throw new Error(`[Financial Datasets API] request failed for ${label}: ${message}`);
  }

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    const errorDetail = await extractApiErrorDetail(response);
    const detailSuffix =
      errorDetail && (errorDetail.code || errorDetail.message)
        ? ` (${errorDetail.code || 'unknown_error'}: ${errorDetail.message || 'request_failed'})`
        : '';
    logger.error(`[Financial Datasets API] error: ${label} — ${detail}${detailSuffix}`);
    throw new Error(`[Financial Datasets API] request failed: ${detail}${detailSuffix}`);
  }

  const data = await response.json().catch(() => {
    const detail = `invalid JSON (${response.status} ${response.statusText})`;
    logger.error(`[Financial Datasets API] parse error: ${label} — ${detail}`);
    throw new Error(`[Financial Datasets API] request failed: ${detail}`);
  });

  return data as Record<string, unknown>;
}

export const api = {
  async get(
    endpoint: string,
    params: ApiParams,
    options?: { cacheable?: boolean; ttlMs?: number },
  ): Promise<ApiResponse> {
    const normalizedParams = normalizeApiParams(params);
    const label = describeRequest(endpoint, normalizedParams);

    // Check local cache first — avoids redundant network calls for immutable data
    if (options?.cacheable) {
      const cached = readCache(endpoint, normalizedParams, options.ttlMs);
      if (cached) {
        return cached;
      }
    }

    const url = new URL(`${getBaseUrl()}${endpoint}`);

    // Add params to URL, handling arrays
    for (const [key, value] of Object.entries(normalizedParams)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(key, v));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    }

    const data = await executeRequest(url.toString(), label, {});

    // Reassemble the full result: follow next_page_url (absolute and
    // self-contained — request it verbatim) until the last page. This runs
    // before the cache write so caches only ever hold complete results.
    let nextPageUrl = data.next_page_url;
    while (typeof nextPageUrl === 'string' && nextPageUrl) {
      const page = await executeRequest(nextPageUrl, label, {});
      mergePage(data, page);
      nextPageUrl = page.next_page_url;
    }
    delete data.next_page_url;

    // Persist for future requests when the caller marked the response as cacheable
    if (options?.cacheable) {
      writeCache(endpoint, normalizedParams, data, url.toString());
    }

    return { data, url: url.toString() };
  },

  async post(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<ApiResponse> {
    const label = `POST ${endpoint}`;
    const url = `${getBaseUrl()}${endpoint}`;

    const data = await executeRequest(url, label, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return { data, url };
  },
};

/** @deprecated Use `api.get` instead */
export const callApi = api.get;

interface VnProxyCapability {
  enabled?: boolean;
  installed?: boolean;
  available?: boolean;
  module?: string;
  error?: string;
}

interface VnProxyCapabilitiesResponse {
  capabilities?: Record<string, VnProxyCapability>;
}

async function getVnProxyCapabilities(): Promise<Record<string, VnProxyCapability>> {
  const { data } = await api.get('/capabilities', {}, { cacheable: true, ttlMs: VN_PROXY_CAPABILITIES_TTL_MS });
  const payload = data as VnProxyCapabilitiesResponse;
  return payload.capabilities && typeof payload.capabilities === 'object' ? payload.capabilities : {};
}

export async function requireVnProxyCapability(capability: 'news' | 'technical_analysis'): Promise<void> {
  const capabilities = await getVnProxyCapabilities();
  const current = capabilities[capability];

  if (current?.available) {
    return;
  }

  const moduleName = current?.module || (capability === 'news' ? 'vnstock_news' : 'vnstock_ta');
  const reason = current?.error || `${moduleName} is not available on the VN proxy.`;
  throw new Error(`[VN Proxy] ${capability} capability unavailable: ${reason}`);
}
