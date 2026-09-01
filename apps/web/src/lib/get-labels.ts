import { getMessages } from 'next-intl/server';
import { labelMapsFrom, type LabelMaps } from './label-maps';

/** Mapas de etiquetas traducidos, para componentes de servidor. */
export async function getLabelMaps(): Promise<LabelMaps> {
  return labelMapsFrom(await getMessages());
}
