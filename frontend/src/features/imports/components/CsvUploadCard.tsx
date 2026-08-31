import { useState, type FormEvent, type ReactNode } from 'react';

import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { Button, FileUploadZone, Panel, StatusMessage } from '@/shared/ui';
import type { ImportOperationResult } from '../types';

export interface CsvUploadCardProps {
  title: string;
  submitLabel: string;
  /** Receives the chosen file; resolve to the server's response. */
  onUpload: (file: File) => Promise<ImportOperationResult>;
  errorMessage: string;
  /** Extra controls rendered above the drop zone, e.g. an import-type choice. */
  children?: ReactNode;
  className?: string;
}

/**
 * CSV upload form shared by every import page.
 *
 * Owns the file selection and the request lifecycle, so pages only supply the
 * endpoint and the copy.
 */
export function CsvUploadCard({
  title,
  submitLabel,
  onUpload,
  errorMessage,
  children,
  className,
}: CsvUploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const upload = useAsyncAction(onUpload, {
    successMessage: (result) => result.message,
    errorMessage,
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFile) return;

    const result = await upload.run(selectedFile);
    if (result !== undefined) setSelectedFile(null);
  };

  return (
    <Panel title={title} className={className}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {children}

        <FileUploadZone onFileSelect={setSelectedFile} />

        <StatusMessage status={upload.status} />

        <Button type="submit" className="w-full" disabled={!selectedFile} isLoading={upload.isPending}>
          {submitLabel}
        </Button>
      </form>
    </Panel>
  );
}
