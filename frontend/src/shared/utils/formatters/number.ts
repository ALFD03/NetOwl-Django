export type NumericValue = number | string | null | undefined;

const toNumber = (value: NumericValue): number => Number(value ?? 0) || 0;

export const formatInteger = (value: NumericValue): string =>
  Math.floor(toNumber(value)).toLocaleString('en-US');

export const formatOneDecimal = (value: NumericValue): string =>
  toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatTwoDecimals = (value: NumericValue): string =>
  toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatPercentage = (value: NumericValue, decimals = 2): string =>
  toNumber(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
