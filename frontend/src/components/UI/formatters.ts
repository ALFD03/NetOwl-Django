export const formatInteger = (val: any) => Math.floor(Number(val || 0)).toLocaleString('en-US');

export const formatOneDecimal = (val: any) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatTwoDecimals = (val: any) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default { formatInteger, formatOneDecimal, formatTwoDecimals };
