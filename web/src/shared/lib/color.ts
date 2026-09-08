/**
 * Convert a `#rrggbb` token to an `rgba()` string.
 *
 * Chart.js fills need a translucent version of the series colour, and there is
 * no way to express that against a hex token without expanding it here.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
