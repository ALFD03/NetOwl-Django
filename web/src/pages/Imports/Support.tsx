/** Página Inertia `Imports/Support` (`/imports/support/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { importsApi } from '@/shared/lib/api/imports';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';
import type { CampoOdoo } from '@/features/imports/types';

interface ImportSupportProps {
  /** Cabeceras del export de tickets de Odoo que lee la importación. */
  camposOdoo?: CampoOdoo[];
}

export default function ImportSupport({ camposOdoo = [] }: ImportSupportProps) {
  const { canAny } = usePermissions();

  const canUpload = canAny(IMPORT_ACTION_PERMISSIONS.support);
  const canRunAnalysis = canAny(ANALYSIS_ACTION_PERMISSIONS.support);

  return (
    <AppLayout>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canUpload && (
          <CsvUploadCard
            title="Cargar Archivo CSV Support (Odoo)"
            submitLabel="Iniciar Carga Support"
            errorMessage="Error al importar tickets de soporte."
            onUpload={importsApi.importSupport}
          />
        )}

        <RequirementsCard
          title="Requisitos de Importación"
          requirements={[
            <>Formato de archivo soportado: <strong>CSV (.csv)</strong></>,
            <>Codificación de caracteres: <strong>UTF-8</strong></>,
            <>Separador de campos: <strong>Comas (,)</strong></>,
            <><strong>Tickets:</strong> Export de tickets de soporte de Odoo, una fila por ticket. Las cabeceras se comparan sin distinguir acentos ni mayúsculas.</>,
          ]}
          camposOdoo={[{ key: 'support', label: 'Tickets de soporte', campos: camposOdoo }]}
          note="Tras importar el archivo, selecciona el mes en la sección inferior y ejecuta el análisis. El análisis calcula también el corte de cada día del mes."
        />
      </div>

      {canRunAnalysis && (
        <AnalysisRunnerCard
          jobModule="support_analysis"
          title="Ejecutar Análisis Technical Support"
          runLabel="Iniciar Cálculo"
          consoleTitle="Consola de Ejecución Technical Support"
          monthPlaceholder="Mes de soporte..."
          pendingLog={() => 'Calculando métricas de Soporte Técnico...'}
          onRun={(month, onProgress) => importsApi.runSupportAnalysis(month, onProgress)}
          successMessage={() => 'Análisis de soporte completado con éxito.'}
          errorMessage="Error al ejecutar análisis de soporte."
        />
      )}
    </AppLayout>
  );
}
