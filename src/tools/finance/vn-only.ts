const VN_ONLY_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

const PRICE_KEYWORDS = ['giá', 'gia', 'price'];

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

function extractTickerCandidates(query: string): string[] {
  const words = query.split(/\s+/).filter(Boolean);
  const priceWordIndex = words.findIndex((word) =>
    PRICE_KEYWORDS.includes(word.toLowerCase().replace(/[^\p{L}]/gu, ''))
  );

  const deduped: string[] = [];

  for (let idx = 0; idx < words.length; idx += 1) {
    const rawToken = words[idx].replace(/[^A-Za-z0-9]/g, '');
    if (!rawToken) continue;

    const token = rawToken.toUpperCase();
    if (!/^[A-Z0-9]{3,5}$/.test(token)) continue;
    if (TICKER_STOPWORDS.has(token)) continue;
    if (!/[A-Z]/.test(token)) continue;

    const hasUpperOriginal = /[A-Z]/.test(rawToken);
    const hasDigit = /\d/.test(rawToken);
    const nearPriceIntent = priceWordIndex >= 0 && idx <= priceWordIndex + 1;

    if (!hasUpperOriginal && !hasDigit && !nearPriceIntent) {
      continue;
    }

    if (!deduped.includes(token)) {
      deduped.push(token);
    }
  }

  return deduped;
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
