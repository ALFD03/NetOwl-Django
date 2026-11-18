/**
 * Página `/imports/support/`.
 *
 * Dos exports: los tickets, que reemplazan la tabla entera, y los logs de etapa,
 * que se **suman** por lotes mensuales (cada log entra una sola vez por su id).
 * Junto a los requisitos se ve qué meses de logs ya están cargados, para saber
 * qué lote falta antes de ejecutar el análisis.
 */

import { useState } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { importsApi, type ImportResponse } from '@/shared/lib/api/imports';
import { formatInteger } from '@/shared/utils/formatters';
import { Panel } from '@/shared/ui';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';
import type { OdooField, OdooFieldGroup } from '@/features/imports/types';

type SupportImportType = 'tickets' | 'logs';

const IMPORT_TYPES: { value: SupportImportType; label: string }[] = [
  { value: 'tickets', label: 'Tickets' },
  { value: 'logs', label: 'Logs de etapa (por lotes)' },
];

interface LoadedLogs {
  logs: number;
  tickets: number;
  since: string | null;
  until: string | null;
  by_month: { month: string; logs: number }[];
}

interface ImportSupportProps {
  /** Cabeceras del export de tickets de Odoo que lee la importación. */
  odoo_fields?: OdooField[];
  /** Cabeceras del export de «Registros de tiempo». */
  odoo_log_fields?: OdooField[];
  loaded_logs?: LoadedLogs;
}

/** Los meses de logs que ya hay: la carga es por lotes y lo que falta no avisa solo. */
function LoadedLogsPanel({ loaded }: { loaded: LoadedLogs }) {
  const maxLogs = Math.max(1, ...loaded.by_month.map((m) => m.logs));
  return (
    <Panel title="Logs de etapa cargados">
      {loaded.logs === 0 ? (
        <p className="text-xs text-slate-400">Todavía no se ha cargado ningún lote.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-300">
            <strong className="text-white">{formatInteger(loaded.logs)}</strong> logs de{' '}
            <strong className="text-white">{formatInteger(loaded.tickets)}</strong> tickets, del {loaded.since} al{' '}
            {loaded.until}. Un mes con muchos menos logs que sus vecinos suele ser un lote que falta.
          </p>
          <div className="space-y-1.5">
            {loaded.by_month.map((m) => (
              <div key={m.month} className="grid grid-cols-[64px_1fr_72px] items-center gap-3 text-xs">
                <span className="font-bold text-slate-300">{m.month}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(m.logs / maxLogs) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums text-slate-400">{formatInteger(m.logs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function ImportSupport({ odoo_fields = [], odoo_log_fields = [], loaded_logs }: ImportSupportProps) {
  const [importType, setImportType] = useState<SupportImportType>('tickets');
  const [loaded, setLoaded] = useState<LoadedLogs | undefined>(loaded_logs);
  const { canAny } = usePermissions();

  const canUpload = canAny(IMPORT_ACTION_PERMISSIONS.support);
  const canRunAnalysis = canAny(ANALYSIS_ACTION_PERMISSIONS.support);

  const fieldGroups: OdooFieldGroup[] = [
    { key: 'tickets', label: 'Tickets', fields: odoo_fields },
    { key: 'logs', label: 'Logs de etapa', fields: odoo_log_fields },
  ];

  const upload = async (file: File): Promise<ImportResponse> => {
    if (importType === 'tickets') return importsApi.importSupport(file);
    const response = await importsApi.importSupportLogs(file);
    const fresh = (response as ImportResponse & { loaded_logs?: LoadedLogs }).loaded_logs;
    if (fresh) setLoaded(fresh);
    return response;
  };

  return (
    <AppLayout>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canUpload && (
          <CsvUploadCard
            title="Cargar Archivo CSV Support (Odoo)"
            submitLabel={importType === 'tickets' ? 'Iniciar Carga Support' : 'Sumar Lote de Logs'}
            errorMessage={importType === 'tickets' ? 'Error al importar tickets de soporte.' : 'Error al importar los logs de soporte.'}
            onUpload={upload}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {IMPORT_TYPES.map((option) => (
                <label
                  key={option.value}
                  className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-surface-tertiary p-3 text-xs font-semibold text-slate-200"
                >
                  <input
                    type="radio"
                    name="importType"
                    className="text-brand"
                    checked={importType === option.value}
                    onChange={() => setImportType(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </CsvUploadCard>
        )}

        <RequirementsCard
          title="Requisitos de Importación"
          requirements={[
            <>Formato de archivo soportado: <strong>CSV (.csv)</strong></>,
            <>Codificación de caracteres: <strong>UTF-8</strong></>,
            <>Separador de campos: <strong>Comas (,)</strong></>,
            <><strong>Tickets:</strong> Export de tickets de soporte de Odoo, una fila por ticket. Reemplaza los anteriores. Las cabeceras se comparan sin distinguir acentos ni mayúsculas.</>,
            <><strong>Logs de etapa:</strong> «Registros de tiempo» de los tickets, un log por fila. <strong>No reemplaza</strong>: cada lote se suma y un log que ya estaba no se duplica, así que se pueden subir mes a mes —los de los tickets creados en el mes y los de los que cambiaron de etapa por última vez en el mes— y repetir o solapar lotes sin miedo.</>,
          ]}
          fieldGroups={fieldGroups}
          activeGroup={importType}
          note="Tras importar, selecciona el mes en la sección inferior y ejecuta el análisis. Calcula también el corte de cada día del mes y, si hay logs cargados, reparte lo escalado entre ATC (como cerrado) y Soporte (como creado ese día)."
        />
      </div>

      {loaded && (
        <div className="mb-6">
          <LoadedLogsPanel loaded={loaded} />
        </div>
      )}

      {canRunAnalysis && (
        <AnalysisRunnerCard
          jobModule="support_analysis"
          title="Ejecutar Análisis Technical Support"
          runLabel="Iniciar Cálculo"
          consoleTitle="Consola de Ejecución Technical Support"
          monthPlaceholder="Mes de soporte..."
          pendingLog={() => 'Calculando métricas de Soporte Técnico...'}
          onRun={(month, onProgress) => importsApi.runSupportAnalysis(month, onProgress)}
          onRunBatch={(months) => importsApi.runSupportAnalysisBatch(months)}
          successMessage={() => 'Análisis de soporte completado con éxito.'}
          errorMessage="Error al ejecutar análisis de soporte."
        />
      )}
    </AppLayout>
  );
}
