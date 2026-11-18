/**
 * El 409 de «producto sin catalogar» de una carga, enseñado como una decisión
 * a tomar y no como un fallo: cuando ocurre no se escribió nada.
 */

import { useState } from 'react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { catalogsApi } from '@/shared/lib/api/catalogs';

import { extractCatalogBlock, type CatalogBlock } from '../lib/catalog';

export function useCatalogBlock() {
  const [block, setBlock] = useState<CatalogBlock | null>(null);
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Envuelve una carga: si vuelve con el bloqueo, lo abre. El error se vuelve
   * a lanzar para que `CsvUploadCard` mantenga su propio mensaje de estado.
   */
  const guard =
    <T>(upload: (file: File) => Promise<T>) =>
    async (file: File) => {
      try {
        return await upload(file);
      } catch (err) {
        const found = extractCatalogBlock(err);
        if (found) {
          setError(null);
          setBlock(found);
        }
        throw err;
      }
    };

  /** Saca un producto de la lista de bloqueo declarando que nunca será un plan. */
  const ignoreProduct = async (productName: string) => {
    setIgnoring(productName);
    setError(null);
    try {
      await catalogsApi.save('ignorados', { productName, note: '', area: 'productos' });
      setBlock((prev) =>
        prev ? { ...prev, products: prev.products.filter((p) => p.name !== productName) } : prev,
      );
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo ignorar el producto.'));
    } finally {
      setIgnoring(null);
    }
  };

  return { block, close: () => setBlock(null), ignoring, error, guard, ignoreProduct };
}
