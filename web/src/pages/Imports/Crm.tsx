/** Página Inertia `Imports/Crm` (`/imports/crm/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { importsApi } from '@/shared/lib/api/imports';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';

export default function ImportCrm() {
  const { canAny } = usePermissions();

  const canUpload = canAny(IMPORT_ACTION_PERMISSIONS.crm);
  const canRunAnalysis = canAny(ANALYSIS_ACTION_PERMISSIONS.crm);

  return (
    <AppLayout title="Importar CRM Analytics" toolbar={<ModuleHeader module="imports" activeTab="crm" />}>
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
          title="Especificaciones Odoo CRM"
          requirements={[
            <>Formato soportado: <strong>CSV (.csv) UTF-8</strong> con separador por coma (,).</>,
            <>Debe contener: ID, Oportunidad, Cliente, Sucursal, Vendedor, Campaña, Etapa, Ganado y Fechas.</>,
            <>Incluye histórico de <strong>Entradas de Tiempo</strong> para seguimiento de horas por etapa.</>,
          ]}
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
