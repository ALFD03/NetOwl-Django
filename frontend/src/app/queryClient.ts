/** Caché de datos de la SPA. Los 4xx no se reintentan: el reintento no los arregla. */

import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        return (status === undefined || status >= 500) && failures < 2;
      },
    },
  },
});
