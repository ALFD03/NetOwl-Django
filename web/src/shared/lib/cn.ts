import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional Tailwind class names, letting later classes win.
 *
 * Plain template strings cannot do this: `` `p-4 ${className}` `` leaves both
 * `p-4` and a caller's `p-2` in the class list and the winner is whichever
 * Tailwind emitted last. `cn('p-4', className)` resolves it to `p-2`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
