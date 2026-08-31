const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;

export const formatPeriodoLabel = (value: string): string => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return value;
  const month = Number(match[2]);
  return `${MONTH_NAMES[month - 1] ?? match[2]} ${match[1]}`;
};
