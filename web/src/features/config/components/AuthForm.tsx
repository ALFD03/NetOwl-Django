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

/** Error banner + fields + submit button, shared by Login and Setup. */
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
