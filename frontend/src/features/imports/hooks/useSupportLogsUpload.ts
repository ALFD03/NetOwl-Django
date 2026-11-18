/**
 * La carga de la pantalla de importación de soporte: tickets o un lote de logs.
 * Tras un lote se refresca el resumen de meses cargados con el que devuelve el
 * servidor.
 */

import { useState } from 'react';

import { importsApi, type ImportResponse } from '@/shared/lib/api/imports';

import type { LoadedLogs } from '../types';

export type SupportImportType = 'tickets' | 'logs';

export function useSupportLogsUpload(initial: LoadedLogs | undefined) {
  const [importType, setImportType] = useState<SupportImportType>('tickets');
  const [loaded, setLoaded] = useState<LoadedLogs | undefined>(initial);

  const upload = async (file: File): Promise<ImportResponse> => {
    if (importType === 'tickets') return importsApi.importSupport(file);
    const response = await importsApi.importSupportLogs(file);
    const fresh = (response as ImportResponse & { loaded_logs?: LoadedLogs }).loaded_logs;
    if (fresh) setLoaded(fresh);
    return response;
  };

  return { importType, setImportType, loaded, upload };
}
