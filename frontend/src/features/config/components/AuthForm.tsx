/** Banner de error, campos y botón de envío de los formularios de acceso. */

import { AlertCircle } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';

import { Button, StatusMessage } from '@/shared/ui';

export interface AuthFormProps {
  /** First non-empty message wins; nothing renders when all are empty. */
  error?: string;
  onSubmit: (event: FormEvent) => void;
  isSubmitting: boolean;
  submitLabel: string;
  children: ReactNode;
}

/** Banner de error + campos + botón. */
export function AuthForm({ error, onSubmit, isSubmitting, submitLabel, children }: AuthFormProps) {
  return (
    <>
      <StatusMessage
        status={error ? { type: 'error', text: error } : null}
        icon={<AlertCircle />}
        className="mb-6"
      />

      <form onSubmit={onSubmit} className="space-y-4">
        {children}
        <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full py-2.5">
          {submitLabel}
        </Button>
      </form>
    </>
  );
}
