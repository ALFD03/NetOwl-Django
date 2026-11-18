import axios from 'axios';

import type { PendingProduct } from '@/shared/types/subscriptions';

/**
 * Respuesta 409 de la importación de suscripciones cuando el export trae
 * productos que el catálogo no reconoce.
 *
 * No es un error del fichero: la importación se detuvo *antes* de escribir
 * nada, así que la tabla anterior sigue intacta y basta con registrar los
 * productos (o marcarlos como ignorados) y volver a subirlo.
 */
export interface CatalogBlock {
  message: string;
  products: PendingProduct[];
  orders: number;
}

interface CatalogBody {
  status?: string;
  message?: string;
  products?: PendingProduct[];
  orders?: number;
}

/**
 * Reconoce ese 409 dentro de lo que lanzó axios, o `null` si es otra cosa.
 *
 * Se mira el `status: 'catalog'` del cuerpo y no solo el código HTTP: un 409
 * también lo devuelve un catálogo vacío, que es un problema de configuración
 * distinto y se enseña como un error normal.
 */
export function extractCatalogBlock(error: unknown): CatalogBlock | null {
  if (!axios.isAxiosError<CatalogBody>(error)) return null;

  const data = error.response?.data;
  if (data?.status !== 'catalog' || !Array.isArray(data.products)) return null;

  return {
    message: data.message ?? 'Hay productos que no están en el catálogo.',
    products: data.products,
    orders: data.orders ?? 0,
  };
}
