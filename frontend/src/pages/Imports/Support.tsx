/**
 * Página `/imports/support/`.
 *
 * Dos exports: los tickets, que reemplazan la tabla entera, y los logs de etapa,
 * que se **suman** por lotes mensuales (cada log entra una sola vez por su id).
 * Junto a los requisitos se ve qué meses de logs ya están cargados, para saber
 * qué lote falta antes de ejecutar el análisis.
 */

import { AppLayout } from '@/shared/layout/AppLayout';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { importsApi } from '@/shared/lib/api/imports';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { ImportTypePicker } from '@/features/imports/components/ImportTypePicker';
import { LoadedLogsPanel } from '@/features/imports/components/LoadedLogsPanel';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';
import { useSupportLogsUpload, type SupportImportType } from '@/features/imports/hooks/useSupportLogsUpload';
import type { LoadedLogs, OdooField, OdooFieldGroup } from '@/features/imports/types';

const IMPORT_TYPES: { value: SupportImportType; label: string }[] = [
  { value: 'tickets', label: 'Tickets' },
  { value: 'logs', label: 'Logs de etapa (por lotes)' },
];

interface ImportSupportProps {
  /** Cabeceras del export de tickets de Odoo que lee la importación. */
  odoo_fields?: OdooField[];
  /** Cabeceras del export de «Registros de tiempo». */
  odoo_log_fields?: OdooField[];
  loaded_logs?: LoadedLogs;
}

export default function ImportSupport({ odoo_fields = [], odoo_log_fields = [], loaded_logs }: ImportSupportProps) {
  const { importType, setImportType, loaded, upload } = useSupportLogsUpload(loaded_logs);
  const { canAny } = usePermissions();

  const fieldGroups: OdooFieldGroup[] = [
    { key: 'tickets', label: 'Tickets', fields: odoo_fields },
    { key: 'logs', label: 'Logs de etapa', fields: odoo_log_fields },
  ];

  return (
    <AppLayout>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canAny(IMPORT_ACTION_PERMISSIONS.support) && (
          <CsvUploadCard
            title="Cargar Archivo CSV Support (Odoo)"
            submitLabel={importType === 'tickets' ? 'Iniciar Carga Support' : 'Sumar Lote de Logs'}
            errorMessage={importType === 'tickets' ? 'Error al importar tickets de soporte.' : 'Error al importar los logs de soporte.'}
            onUpload={upload}
          >
            <ImportTypePicker options={IMPORT_TYPES} value={importType} onChange={setImportType} />
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

      {canAny(ANALYSIS_ACTION_PERMISSIONS.support) && (
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
