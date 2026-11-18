/**
 * Una ruta cuya página recibe por props lo que devuelve su endpoint de `/api/`.
 *
 * Los parámetros de la URL (búsqueda y ruta) viajan tal cual al endpoint; al
 * cambiarlos se vuelve a pedir sin desmontar la página, que conserva su estado.
 * Tras una escritura los datos se invalidan y llegan solos, también sin desmontar.
 * Una visita con `remount` (`useVisit`) espera los datos frescos y monta la página
 * de nuevo, sin el estado anterior.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';

import { AppLayout } from '@/shared/layout/AppLayout';
import { apiClient, getApiErrorMessage } from '@/shared/lib/api/client';
import { PageDataContext, type VisitState } from '@/shared/page/PageData';
import { LoadingState } from '@/shared/ui';

type PageComponent = ComponentType<Record<string, unknown>>;

function ApiPage({ endpoint, Page }: { endpoint: string; Page: PageComponent }) {
  const { search, state } = useLocation();
  const routeParams = useParams();
  const remount = (state as VisitState | null)?.remount;
  const params = useMemo(
    () => ({ ...Object.fromEntries(new URLSearchParams(search)), ...routeParams }),
    [search, routeParams],
  );
  const queryKey = useMemo(() => ['page', endpoint, params], [endpoint, params]);
  const { data, error, isPending, refetch } = useQuery({
    queryKey,
    queryFn: async () => (await apiClient.get<Record<string, unknown>>(endpoint, { params })).data,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  // La página se monta de nuevo solo cuando llegan los datos de la visita, no
  // con los anteriores que se siguen enseñando mientras tanto.
  const [mountKey, setMountKey] = useState(remount);
  useEffect(() => {
    if (remount === undefined || remount === mountKey) return undefined;
    let alive = true;
    void refetch().then(() => alive && setMountKey(remount));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al llegar otra visita
  }, [remount]);

  if (isPending) {
    return (
      <AppLayout>
        <LoadingState message="Cargando…" />
      </AppLayout>
    );
  }
  if (error || !data) {
    return (
      <AppLayout>
        <p className="p-12 text-center text-sm text-rose-400">
          {getApiErrorMessage(error, 'No se pudieron cargar los datos de la página.')}
        </p>
      </AppLayout>
    );
  }
  return (
    <PageDataContext.Provider value={data}>
      <Page key={mountKey ?? 'page'} {...data} />
    </PageDataContext.Provider>
  );
}

/** `lazy` de React Router para una página con datos de `endpoint`. */
export const apiPage = (endpoint: string, load: () => Promise<{ default: ComponentType<never> }>) => async () => {
  const Page = (await load()).default as unknown as PageComponent;
  return { Component: () => <ApiPage endpoint={endpoint} Page={Page} /> };
};

/** `lazy` de React Router para una página sin datos propios. */
export const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});
