import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { importsApi } from '@/shared/lib/api/imports';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';

export default function ImportSupport() {
  const { canAny } = usePermissions();

  const canUpload = canAny(IMPORT_ACTION_PERMISSIONS.support);
  const canRunAnalysis = canAny(ANALYSIS_ACTION_PERMISSIONS.support);

  return (
    <AppLayout title="Importar Technical Support" toolbar={<ModuleHeader module="imports" activeTab="support" />}>
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
          title="Columnas Requeridas"
          requirements={[
            'Secuencia ID del ticket',
            'Cliente',
            'Etapa',
            'Equipo de soporte al cliente',
            'Asignado a',
            'Suscripción/Sucursal',
            'Zona',
            'Tipo',
            'Razón de la falla',
            'Solución de la falla',
            'Creado el',
            'Primera fecha asignada',
            'Última actualización de la etapa',
            'Duración total (horas)',
          ]}
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
          onRun={(month) => importsApi.runSupportAnalysis(month)}
          successMessage={() => 'Análisis de soporte completado con éxito.'}
          errorMessage="Error al ejecutar análisis de soporte."
        />
      )}
    </AppLayout>
  );
}
