/**
 * Una ruta cuya página recibe por props lo que devuelve su endpoint de `/api/`.
 *
 * Los parámetros de la URL (búsqueda y ruta) viajan tal cual al endpoint; al
 * cambiarlos se vuelve a pedir sin desmontar la página, que conserva su estado.
 */

import { useCallback, useMemo } from 'react';
import type { ComponentType } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';

import { AppLayout } from '@/shared/layout/AppLayout';
import { apiClient, getApiErrorMessage } from '@/shared/lib/api/client';
import { PageDataContext } from '@/shared/page/PageData';
import { LoadingState } from '@/shared/ui';

type PageComponent = ComponentType<Record<string, unknown>>;

function ApiPage({ endpoint, Page }: { endpoint: string; Page: PageComponent }) {
  const { search } = useLocation();
  const routeParams = useParams();
  const params = useMemo(
    () => ({ ...Object.fromEntries(new URLSearchParams(search)), ...routeParams }),
    [search, routeParams],
  );
  const queryKey = useMemo(() => ['page', endpoint, params], [endpoint, params]);
  const queryClient = useQueryClient();

  const { data, error, isPending } = useQuery({
    queryKey,
    queryFn: async () => (await apiClient.get<Record<string, unknown>>(endpoint, { params })).data,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['page', endpoint] }),
    [queryClient, endpoint],
  );
  const value = useMemo(() => ({ props: data ?? {}, reload }), [data, reload]);

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
    <PageDataContext.Provider value={value}>
      <Page {...data} />
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
