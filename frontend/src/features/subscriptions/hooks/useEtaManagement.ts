import { useState } from 'react';
import { useOnOpen } from '@/shared/hooks/useOnOpen';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import type { EtaDiscoveredSubscription, EtaSubscriptionConfig, SubscriptionEtaManagementProps } from '@/features/subscriptions/types';

/**
 * Estado de la pantalla de parametrización ETA: las excepciones por orden. La
 * clasificación de los planes vive en el catálogo (`/catalogos/productos/`).
 */
export function useEtaManagement({ allKnownPlans = [], discoveredPlans = [], discoveredSubs = [] }: SubscriptionEtaManagementProps) {
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeView, setActiveTab] = useState<'discovered_plans' | 'discovered_subs' | 'individual'>(() => discoveredPlans.length ? 'discovered_plans' : discoveredSubs.length ? 'discovered_subs' : 'individual');
  const [editingSub, setEditingSub] = useState<EtaSubscriptionConfig | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'sub'; id: string } | null>(null);

  const handleOpenEditSub = (config: EtaSubscriptionConfig) => {
    const isKnown = allKnownPlans.some((plan) => plan.name === config.producto);
    setIsCustomProduct(!isKnown && Boolean(config.producto));
    setEditingSub({ orden: config.orden || '', cliente: config.cliente || '', producto: config.producto || '', tecnologia: config.tecnologia || 'FTTH', tipo_persona: config.tipo_persona || 'pyme', datas_mbps: config.datas_mbps || 0, precio: config.precio || 0, tiene_tv: Boolean(config.tiene_tv), reportar: config.reportar !== undefined ? Boolean(config.reportar) : true, es_transporte: Boolean(config.es_transporte), es_dedicado: Boolean(config.es_dedicado) });
  };
  const [error, setError] = useState<string | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formularioAbierto = Boolean(editingSub || deletingItem);
  useOnOpen(formularioAbierto, () => setError(null));

  /** Ejecuta una escritura; si falla, el error queda en el modal abierto o en la página. */
  const run = async (action: () => Promise<unknown>, fallo: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, fallo));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSub = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingSub) return;
    if (await run(() => subscriptionsApi.saveEtaSubConfig(editingSub), 'No se pudo guardar la suscripción.')) setEditingSub(null);
  };
  const handleQuickIgnoreSub = (sub: EtaDiscoveredSubscription) =>
    run(() => subscriptionsApi.saveEtaSubConfig({ orden: sub.orden, cliente: sub.cliente || '', producto: sub.producto || 'Servicio Excluido', reportar: false, tecnologia: 'FTTH', tipo_persona: 'pyme', datas_mbps: 0, precio: 0, es_transporte: false, es_dedicado: false }), 'No se pudo descartar la suscripción.');
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    if (await run(() => subscriptionsApi.deleteEtaSubConfig({ orden: deletingItem.id }), 'No se pudo eliminar el registro.')) setDeletingItem(null);
  };
  const handleSelectPredefinedPlan = (planName: string) => {
    if (planName === '__CUSTOM__') { setIsCustomProduct(true); setEditingSub((prev) => prev ? { ...prev, producto: '' } : prev); return; }
    setIsCustomProduct(false);
    const found = allKnownPlans.find((plan) => plan.name === planName);
    setEditingSub((prev) => prev ? { ...prev, producto: found?.name || planName, ...(found ? { tecnologia: found.tecnologia || 'FTTH', tipo_persona: found.tipo_persona || 'nat', datas_mbps: found.datas_mbps || 0, tiene_tv: Boolean(found.tiene_tv), es_transporte: Boolean(found.es_transporte), es_dedicado: Boolean(found.es_dedicado) } : {}) } : prev);
  };
  return { isCustomProduct, setIsCustomProduct, isSaving, error, activeView, setActiveTab, editingSub, setEditingSub, deletingItem, setDeletingItem, handleOpenEditSub, handleUpdateSub, handleQuickIgnoreSub, handleConfirmDelete, handleSelectPredefinedPlan };
}
