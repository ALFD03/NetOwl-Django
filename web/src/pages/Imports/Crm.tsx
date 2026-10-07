/** Página Inertia `Imports/Crm` (`/imports/crm/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { importsApi } from '@/shared/lib/api/imports';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';
import type { CampoOdoo } from '@/features/imports/types';

interface ImportCrmProps {
  /** Cabeceras de Odoo CRM que lee la importación. */
  camposOdoo?: CampoOdoo[];
}

export default function ImportCrm({ camposOdoo = [] }: ImportCrmProps) {
  const { canAny } = usePermissions();

  const canUpload = canAny(IMPORT_ACTION_PERMISSIONS.crm);
  const canRunAnalysis = canAny(ANALYSIS_ACTION_PERMISSIONS.crm);

  return (
    <AppLayout>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canUpload && (
          <CsvUploadCard
            title="Cargar Exportación CSV Odoo CRM"
            submitLabel="Iniciar Carga CRM"
            errorMessage="Error al importar datos de CRM."
            onUpload={importsApi.importCrm}
          />
        )}

        <RequirementsCard
          title="Requisitos de Importación"
          requirements={[
            <>Formato de archivo soportado: <strong>CSV (.csv)</strong></>,
            <>Codificación de caracteres: <strong>UTF-8</strong></>,
            <>Separador de campos: <strong>Comas (,)</strong></>,
            <><strong>Oportunidades:</strong> Export de Odoo CRM con una fila por oportunidad y sus líneas de <strong>Entradas de Tiempo</strong> debajo, para seguir las horas por etapa.</>,
          ]}
          camposOdoo={[{ key: 'crm', label: 'Oportunidades CRM', campos: camposOdoo }]}
          note="Tras importar el archivo, selecciona el mes a procesar en la sección inferior para calcular las cohortes."
        />
      </div>

      {canRunAnalysis && (
        <AnalysisRunnerCard
          jobModule="crm_analysis"
          title="Ejecutar Análisis Mensual de CRM"
          description="Calcula la cohorte del mes: ganados, perdidos, pendientes, devueltos E8 y SLAs."
          runLabel="Iniciar Cálculo CRM"
          consoleTitle="Consola de Ejecución CRM"
          monthPlaceholder="Elegir mes de análisis..."
          requireMonth
          pendingLog={(month) => `Iniciando motor de análisis CRM para el periodo ${month}...`}
          onRun={(month, onProgress) => importsApi.runCrmAnalysis(month ?? '', onProgress)}
          successMessage={(result, month) =>
            `Análisis de CRM completado exitosamente para ${result.periodo_label || month}.`}
          errorMessage="Error al ejecutar el análisis CRM."
        />
      )}
    </AppLayout>
  );
}
