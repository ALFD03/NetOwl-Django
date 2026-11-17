/** Tarjeta de carga de un CSV, con su estado y su mensaje de resultado. */

import { useState, type FormEvent, type ReactNode } from 'react';

import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { cn } from '@/shared/lib/cn';
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
 * endpoint and the copy. Va junto al cuadro de requisitos, que es más alto: la
 * tarjeta llena el alto de la fila y la zona de arrastre se estira para ocupar
 * lo que sobra, en vez de dejar la mitad de la tarjeta vacía.
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
    <Panel title={title} className={cn('flex flex-col', className)} bodyClassName="flex flex-1 flex-col">
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
        {children}

        <FileUploadZone onFileSelect={setSelectedFile} fill />

        <StatusMessage status={upload.status} />

        <Button type="submit" className="w-full" disabled={!selectedFile} isLoading={upload.isPending}>
          {submitLabel}
        </Button>
      </form>
    </Panel>
  );
}
