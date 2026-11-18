/**
 * Página `/imports/subscriptions/`.
 *
 * Carga los exports del dominio y lanza el análisis mensual. Intercepta el
 * 409 de «producto sin catalogar» para enseñarlo como una decisión a tomar, no
 * como un fallo: cuando ocurre no se escribió nada.
 */

import { useState } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { ANALYSIS_ACTION_PERMISSIONS, IMPORT_ACTION_PERMISSIONS } from '@/shared/constants/permissions';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { importsApi, type ImportResponse } from '@/shared/lib/api/imports';
import { catalogsApi } from '@/shared/lib/api/catalogs';
import { AnalysisRunnerCard } from '@/features/imports/components/AnalysisRunnerCard';
import { CatalogBlockModal } from '@/features/imports/components/CatalogBlockModal';
import { CsvUploadCard } from '@/features/imports/components/CsvUploadCard';
import { RequirementsCard } from '@/features/imports/components/RequirementsCard';
import { extractCatalogBlock, type CatalogBlock } from '@/features/imports/lib/catalog';
import type { CampoOdoo, OdooFieldGroup } from '@/features/imports/types';

type SubscriptionImportType = 'subscriptions' | 'logs' | 'gratis' | 'facturas';

const IMPORT_TYPES: { value: SubscriptionImportType; label: string }[] = [
  { value: 'subscriptions', label: 'Suscripciones / Clientes' },
  { value: 'logs', label: 'Logs / Transiciones' },
  { value: 'gratis', label: 'Planes Gratuitos' },
  { value: 'facturas', label: 'Facturas' },
];

const UPLOADERS: Record<SubscriptionImportType, (file: File) => Promise<ImportResponse>> = {
  subscriptions: (file) => importsApi.importSubscriptions(file),
  logs: (file) => importsApi.importLogs(file),
  gratis: (file) => importsApi.importGratis(file),
  facturas: (file) => importsApi.importFacturas(file),
};

interface ImportSubscriptionsProps {
  /** Cabeceras de Odoo que lee cada importación, por tipo de export. */
  camposOdoo?: Partial<Record<SubscriptionImportType, CampoOdoo[]>>;
}

export default function ImportSubscriptions({ camposOdoo = {} }: ImportSubscriptionsProps) {
  const [importType, setImportType] = useState<SubscriptionImportType>('subscriptions');
  const [bloqueo, setBloqueo] = useState<CatalogBlock | null>(null);
  const [ignorando, setIgnorando] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const { canAny } = usePermissions();

  const canUpload = canAny(IMPORT_ACTION_PERMISSIONS.subs);
  const canRunAnalysis = canAny(ANALYSIS_ACTION_PERMISSIONS.subs);

  const fieldGroups: OdooFieldGroup[] = IMPORT_TYPES.map((tipo) => ({
    key: tipo.value,
    label: tipo.label,
    campos: camposOdoo[tipo.value] ?? [],
  }));

  /**
   * Intercepta el 409 de "producto sin catalogar" y lo enseña como una
   * decisión a tomar, no como un fallo. El error se vuelve a lanzar para que
   * `CsvUploadCard` mantenga su propio mensaje de estado.
   */
  const uploadFile = async (file: File) => {
    try {
      return await UPLOADERS[importType](file);
    } catch (error) {
      const found = extractCatalogBlock(error);
      if (found) {
        setCatalogError(null);
        setBloqueo(found);
      }
      throw error;
    }
  };

  /** Saca un producto de la lista de bloqueo declarando que nunca será un plan. */
  const ignorarProducto = async (nombre: string) => {
    setIgnorando(nombre);
    setCatalogError(null);
    try {
      await catalogsApi.guardar('ignorados', { nombre, nota: '', area: 'productos' });
      setBloqueo((previo) =>
        previo
          ? { ...previo, productos: previo.productos.filter((p) => p.nombre !== nombre) }
          : previo,
      );
    } catch (error: unknown) {
      setCatalogError(getApiErrorMessage(error, 'No se pudo ignorar el producto.'));
    } finally {
      setIgnorando(null);
    }
  };

  return (
    <AppLayout>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canUpload && (
          <CsvUploadCard
            title="Cargar Archivo CSV Subscriptions"
            submitLabel="Iniciar Carga"
            errorMessage="Error al procesar la importación."
            onUpload={uploadFile}
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
            <><strong>Suscripciones:</strong> Debe contener orden, cliente, producto, fecha de inicio, tarifa, total.</>,
            <><strong>Logs:</strong> Debe contener orden, fecha de cambio, nota y estado interno.</>,
            <><strong>Planes Gratuitos:</strong> Export con tarifa, próxima fecha de factura y mensajes del chatter; detecta desde cuándo cada suscripción es gratuita.</>,
            <><strong>Facturas:</strong> Export global de facturas con su número, estado, estado del pago, fecha de creación y productos. Reemplaza las anteriores; Comisiones lo usa para saber qué primeras mensualidades se pagaron.</>,
          ]}
          camposOdoo={fieldGroups}
          activeGroup={importType}
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
          onRun={(month, onProgress) => importsApi.runSubscriptionsAnalysis(month, onProgress)}
          onRunBatch={(months) => importsApi.runSubscriptionsAnalysisBatch(months)}
          successMessage={(result, month) =>
            `Análisis de Churn completado exitosamente para ${result.periodo_label || month}` +
            (result.dias_calculados ? ` (${result.dias_calculados} días calculados).` : '.')}
          errorMessage="Error al ejecutar el análisis de Churn."
        />
      )}

      <CatalogBlockModal
        bloqueo={bloqueo}
        onClose={() => setBloqueo(null)}
        onIgnore={ignorarProducto}
        ignorando={ignorando}
        error={catalogError}
      />
    </AppLayout>
  );
}
