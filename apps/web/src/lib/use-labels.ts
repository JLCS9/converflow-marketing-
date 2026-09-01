'use client';

import { useMessages } from 'next-intl';
import { labelMapsFrom, type LabelMaps } from './label-maps';

/** Mapas de etiquetas traducidos, para componentes cliente. */
export function useLabelMaps(): LabelMaps {
  return labelMapsFrom(useMessages());
}
