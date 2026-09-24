import { useState } from 'react';
import { router } from '@inertiajs/react';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import type { EtaDiscoveredSubscription, EtaSubscriptionConfig, SubscriptionEtaManagementProps } from '@/features/subscriptions/types';

/**
 * Estado de la pantalla de parametrización ETA.
 *
 * Ya no gestiona planes: la clasificación de un plan vive en el catálogo
 * (`/subscriptions/config/`) y ETA solo conserva lo que no tiene equivalente
 * allí, las excepciones por orden.
 */
// `individualConfigs` ya no se lee aqui: el buscado y el filtrado de esa tabla
// los hace `DataTable`, asi que la vista le pasa la lista tal cual.
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
  const handleUpdateSub = async (event: React.FormEvent) => { event.preventDefault(); if (!editingSub) return; setIsSaving(true); try { await subscriptionsApi.saveEtaSubConfig(editingSub); setEditingSub(null); router.reload(); } finally { setIsSaving(false); } };
  const handleQuickIgnoreSub = async (sub: EtaDiscoveredSubscription) => { try { await subscriptionsApi.saveEtaSubConfig({ orden: sub.orden, cliente: sub.cliente || '', producto: sub.producto || 'Servicio Excluido', reportar: false, tecnologia: 'FTTH', tipo_persona: 'pyme', datas_mbps: 0, precio: 0, es_transporte: false, es_dedicado: false }); router.reload(); } catch { alert('Error al descartar la suscripción'); } };
  const handleConfirmDelete = async () => { if (!deletingItem) return; try { await subscriptionsApi.deleteEtaSubConfig({ orden: deletingItem.id }); setDeletingItem(null); router.reload(); } catch { alert('Error al eliminar el registro'); } };
  const handleSelectPredefinedPlan = (planName: string) => {
    if (planName === '__CUSTOM__') { setIsCustomProduct(true); setEditingSub((prev) => prev ? { ...prev, producto: '' } : prev); return; }
    setIsCustomProduct(false);
    const found = allKnownPlans.find((plan) => plan.name === planName);
    setEditingSub((prev) => prev ? { ...prev, producto: found?.name || planName, ...(found ? { tecnologia: found.tecnologia || 'FTTH', tipo_persona: found.tipo_persona || 'nat', datas_mbps: found.datas_mbps || 0, tiene_tv: Boolean(found.tiene_tv), es_transporte: Boolean(found.es_transporte), es_dedicado: Boolean(found.es_dedicado) } : {}) } : prev);
  };
  return { isCustomProduct, setIsCustomProduct, isSaving, activeView, setActiveTab, editingSub, setEditingSub, deletingItem, setDeletingItem, handleOpenEditSub, handleUpdateSub, handleQuickIgnoreSub, handleConfirmDelete, handleSelectPredefinedPlan };
}
