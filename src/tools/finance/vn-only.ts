const VN_ONLY_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

const PRICE_KEYWORDS = ['giá', 'gia', 'price'];
const HISTORICAL_PRICE_KEYWORDS = [
  'lịch sử',
  'lich su',
  'history',
  'trend',
  'xu hướng',
  'xuhuong',
  '6m',
  '6 months',
  '6 month',
  '6 tháng',
  '6 thang',
];
const NON_PRICE_INTENT_KEYWORDS = [
  'bctc',
  'financial',
  'income',
  'balance',
  'cashflow',
  'cash flow',
  'p/e',
  'p b',
  'p/b',
  'pb',
  'pe',
  'market cap',
  'doanh thu',
  'lợi nhuận',
  'loi nhuan',
];

const TICKER_STOPWORDS = new Set([
  'GIA',
  'PRICE',
  'HOSE',
  'HNX',
  'UPCOM',
  'VN',
]);

export interface VnPriceProbe {
  ticker: string;
  isSimplePriceQuery: boolean;
}

export interface VnPriceBatchProbe {
  tickers: string[];
  lookbackMonths: number;
  startDate: string;
  endDate: string;
  isPriceOnlyQuery: boolean;
}

export function isVnOnlyMode(): boolean {
  return VN_ONLY_ENABLED_VALUES.has(String(process.env.VN_ONLY_MODE || '').toLowerCase());
}

export function normalizeVnTicker(ticker: string): string {
  let normalized = ticker.trim().toUpperCase();
  normalized = normalized.replace(/\s+/g, '');
  normalized = normalized.replace(/\.VN$/i, '');
  normalized = normalized.replace(/:(HOSE|HNX|UPCOM)$/i, '');
  return normalized;
}

function hasPriceIntent(query: string): boolean {
  const lowered = query.toLowerCase();
  return PRICE_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

function hasHistoricalPriceIntent(query: string): boolean {
  const lowered = query.toLowerCase();
  return HISTORICAL_PRICE_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

function isPriceOnlyQuery(query: string): boolean {
  const lowered = query.toLowerCase();
  return !NON_PRICE_INTENT_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

export function extractTickerCandidates(query: string): string[] {
  const words = query.split(/\s+/).filter(Boolean);
  const priceWordIndex = words.findIndex((word) =>
    PRICE_KEYWORDS.includes(word.toLowerCase().replace(/[^\p{L}]/gu, ''))
  );

  const deduped: string[] = [];

  for (let idx = 0; idx < words.length; idx += 1) {
    const rawToken = words[idx]
      .replace(/^[^A-Za-z0-9]+/g, '')
      .replace(/[^A-Za-z0-9:.]+$/g, '');
    if (!rawToken) continue;

    // Normalize exchange suffixes before validating ticker shape.
    const token = normalizeVnTicker(rawToken);
    if (!/^[A-Z0-9]{3,5}$/.test(token)) continue;
    if (TICKER_STOPWORDS.has(token)) continue;
    if (!/[A-Z]/.test(token)) continue;

    const isAllUpperLike = rawToken === rawToken.toUpperCase();
    const hasDigit = /\d/.test(rawToken);
    const nearPriceIntent = priceWordIndex >= 0 && Math.abs(idx - priceWordIndex) <= 1;

    if (!isAllUpperLike && !hasDigit && !nearPriceIntent) {
      continue;
    }

    if (!deduped.includes(token)) {
      deduped.push(token);
    }
  }

  return deduped;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function subtractMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() - months);
  return copy;
}

function extractLookbackMonths(query: string): number | null {
  const normalized = query.toLowerCase();
  const explicitMatch = normalized.match(/(\d{1,2})\s*(tháng|thang|month|months|m)\b/u);
  if (explicitMatch) {
    const months = Number(explicitMatch[1]);
    if (Number.isInteger(months) && months >= 1 && months <= 24) {
      return months;
    }
  }

  if (hasHistoricalPriceIntent(query)) {
    return 6;
  }

  return null;
}

export function detectVnPriceProbe(query: string): VnPriceProbe | null {
  if (!isVnOnlyMode()) return null;
  if (!hasPriceIntent(query)) return null;

  const candidates = extractTickerCandidates(query);
  if (candidates.length !== 1) return null;

  const ticker = normalizeVnTicker(candidates[0]);
  if (!ticker) return null;

  const words = query.trim().split(/\s+/).filter(Boolean);
  return {
    ticker,
    isSimplePriceQuery: words.length <= 3,
  };
}

export function detectVnPriceBatchProbe(query: string): VnPriceBatchProbe | null {
  if (!isVnOnlyMode()) return null;
  if (!hasPriceIntent(query)) return null;

  const lookbackMonths = extractLookbackMonths(query);
  if (!lookbackMonths) return null;

  const tickers = extractTickerCandidates(query);
  if (tickers.length === 0) return null;

  const endDate = getUtcToday();
  const startDate = subtractMonths(endDate, lookbackMonths);

  return {
    tickers,
    lookbackMonths,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    isPriceOnlyQuery: isPriceOnlyQuery(query),
  };
}
