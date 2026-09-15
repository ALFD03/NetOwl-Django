/**
 * Página Inertia `Imports/Subscriptions` (`/imports/subscriptions/`).
 *
 * Carga los tres exports del dominio y lanza el análisis mensual. Intercepta el
 * 409 de «producto sin catalogar» para enseñarlo como una decisión a tomar, no
 * como un fallo: cuando ocurre no se escribió nada.
 */

import { useState } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { importsApi, type ImportResponse } from '@/shared/lib/api/imports';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CatalogoBloqueoModal } from '@/features/imports/components/CatalogoBloqueoModal';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';
import { extractCatalogoBloqueo, type CatalogoBloqueo } from '@/features/imports/lib/catalogo';

type SubscriptionImportType = 'subscriptions' | 'logs' | 'gratis';

const IMPORT_TYPES: { value: SubscriptionImportType; label: string }[] = [
  { value: 'subscriptions', label: 'Suscripciones / Clientes' },
  { value: 'logs', label: 'Logs / Transiciones' },
  { value: 'gratis', label: 'Planes Gratuitos' },
];

const UPLOADERS: Record<SubscriptionImportType, (file: File) => Promise<ImportResponse>> = {
  subscriptions: (file) => importsApi.importSubscriptions(file),
  logs: (file) => importsApi.importLogs(file),
  gratis: (file) => importsApi.importGratis(file),
};

export default function ImportSubscriptions() {
  const [importType, setImportType] = useState<SubscriptionImportType>('subscriptions');
  const [bloqueo, setBloqueo] = useState<CatalogoBloqueo | null>(null);
  const [ignorando, setIgnorando] = useState<string | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const { canAny } = usePermissions();

  const canUpload = canAny(IMPORT_ACTION_PERMISSIONS.subs);
  const canRunAnalysis = canAny(ANALYSIS_ACTION_PERMISSIONS.subs);

  /**
   * Intercepta el 409 de "producto sin catalogar" y lo enseña como una
   * decisión a tomar, no como un fallo. El error se vuelve a lanzar para que
   * `CsvUploadCard` mantenga su propio mensaje de estado.
   */
  const subirArchivo = async (file: File) => {
    try {
      return await UPLOADERS[importType](file);
    } catch (error) {
      const encontrado = extractCatalogoBloqueo(error);
      if (encontrado) {
        setErrorCatalogo(null);
        setBloqueo(encontrado);
      }
      throw error;
    }
  };

  /** Saca un producto de la lista de bloqueo declarando que nunca será un plan. */
  const ignorarProducto = async (nombre: string) => {
    setIgnorando(nombre);
    setErrorCatalogo(null);
    try {
      await subscriptionsApi.saveCatalogo('ignorados', { nombre, nota: '' });
      setBloqueo((previo) =>
        previo
          ? { ...previo, productos: previo.productos.filter((p) => p.nombre !== nombre) }
          : previo,
      );
    } catch (error: unknown) {
      setErrorCatalogo(getApiErrorMessage(error, 'No se pudo ignorar el producto.'));
    } finally {
      setIgnorando(null);
    }
  };

  return (
    <AppLayout title="Importar Subscriptions" toolbar={<ModuleHeader module="imports" activeTab="subscriptions" />}>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canUpload && (
          <CsvUploadCard
            title="Cargar Archivo CSV Subscriptions"
            submitLabel="Iniciar Carga"
            errorMessage="Error al procesar la importación."
            onUpload={subirArchivo}
          >
            <div className="flex gap-3">
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
            <><strong>Suscripciones:</strong> Debe contener orden, cliente, producto, fecha de inicio, tarifa, total.</>,
            <><strong>Logs:</strong> Debe contener orden, fecha de cambio, nota y estado interno.</>,
            <><strong>Planes Gratuitos:</strong> Export con tarifa, próxima fecha de factura y mensajes del chatter; detecta desde cuándo cada suscripción es gratuita.</>,
          ]}
          note="Tras cargar ambos archivos, selecciona el mes correspondiente y ejecuta el análisis en la sección inferior. El análisis calcula también las métricas de cada día del mes."
        />
      </div>

      {canRunAnalysis && (
        <AnalysisRunnerCard
          jobModule="subs_analysis"
          title="Ejecutar Análisis Mensual de Subscriptions (Churn)"
          description="Calcula la base inicial, final, nuevos, reactivaciones y matrices dimensionales del mes, y el corte acumulado de cada día para la barra de días."
          runLabel="Iniciar Análisis Churn"
          consoleTitle="Consola de Ejecución MetricsAnalyzer"
          monthPlaceholder="Elegir mes de análisis..."
          requireMonth
          missingMonthMessage="Por favor selecciona un mes en el calendario."
          pendingLog={(month) => `Iniciando motor de análisis de Churn para el periodo ${month}...`}
          onRun={(month) => importsApi.runSubscriptionsAnalysis(month)}
          successMessage={(result, month) =>
            `Análisis de Churn completado exitosamente para ${result.periodo_label || month}` +
            (result.dias_calculados ? ` (${result.dias_calculados} días calculados).` : '.')}
          errorMessage="Error al ejecutar el análisis de Churn."
        />
      )}

      <CatalogoBloqueoModal
        bloqueo={bloqueo}
        onClose={() => setBloqueo(null)}
        onIgnore={ignorarProducto}
        ignorando={ignorando}
        error={errorCatalogo}
      />
    </AppLayout>
  );
}
