/**
 * Página `/catalogos/estructura/`.
 *
 * Zonas, sites y estados.
 */

import { StructureView } from '@/features/subscriptions/components/catalogs/StructureView';
import type { CatalogsStructureProps } from '@/features/subscriptions/types';

export default function CatalogsStructure(props: CatalogsStructureProps) {
  return <StructureView {...props} />;
}
