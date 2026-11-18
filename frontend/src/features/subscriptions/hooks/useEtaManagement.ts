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
    const isKnown = allKnownPlans.some((plan) => plan.name === config.product);
    setIsCustomProduct(!isKnown && Boolean(config.product));
    setEditingSub({ order: config.order || '', client: config.client || '', product: config.product || '', technology: config.technology || 'FTTH', person_type: config.person_type || 'pyme', data_mbps: config.data_mbps || 0, price: config.price || 0, has_tv: Boolean(config.has_tv), report: config.report !== undefined ? Boolean(config.report) : true, is_transport: Boolean(config.is_transport), is_dedicated: Boolean(config.is_dedicated) });
  };
  const [error, setError] = useState<string | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = Boolean(editingSub || deletingItem);
  useOnOpen(formOpen, () => setError(null));

  /** Ejecuta una escritura; si falla, el error queda en el modal abierto o en la página. */
  const run = async (action: () => Promise<unknown>, onFail: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, onFail));
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
    run(() => subscriptionsApi.saveEtaSubConfig({ order: sub.order, client: sub.client || '', product: sub.product || 'Servicio Excluido', report: false, technology: 'FTTH', person_type: 'pyme', data_mbps: 0, price: 0, is_transport: false, is_dedicated: false }), 'No se pudo descartar la suscripción.');
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    if (await run(() => subscriptionsApi.deleteEtaSubConfig({ order: deletingItem.id }), 'No se pudo eliminar el registro.')) setDeletingItem(null);
  };
  const handleSelectPredefinedPlan = (planName: string) => {
    if (planName === '__CUSTOM__') { setIsCustomProduct(true); setEditingSub((prev) => prev ? { ...prev, product: '' } : prev); return; }
    setIsCustomProduct(false);
    const found = allKnownPlans.find((plan) => plan.name === planName);
    setEditingSub((prev) => prev ? { ...prev, product: found?.name || planName, ...(found ? { technology: found.technology || 'FTTH', person_type: found.person_type || 'nat', data_mbps: found.data_mbps || 0, has_tv: Boolean(found.has_tv), is_transport: Boolean(found.is_transport), is_dedicated: Boolean(found.is_dedicated) } : {}) } : prev);
  };
  return { isCustomProduct, setIsCustomProduct, isSaving, error, activeView, setActiveTab, editingSub, setEditingSub, deletingItem, setDeletingItem, handleOpenEditSub, handleUpdateSub, handleQuickIgnoreSub, handleConfirmDelete, handleSelectPredefinedPlan };
}
