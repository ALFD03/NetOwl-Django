export type NumericValue = number | string | null | undefined;

/**
 * Safe numeric coercion for anything arriving from the API, where a measure may
 * be a number, a numeric string, or missing entirely.
 *
 * Non-finite results collapse to 0 — `Infinity` reaching a chart scale or a
 * `toLocaleString` is never what the caller wants.
 */
export const toNumber = (value: NumericValue): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatInteger = (value: NumericValue): string =>
  Math.floor(toNumber(value)).toLocaleString('en-US');

export const formatOneDecimal = (value: NumericValue): string =>
  toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatTwoDecimals = (value: NumericValue): string =>
  toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatPercentage = (value: NumericValue, decimals = 2): string =>
  toNumber(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
