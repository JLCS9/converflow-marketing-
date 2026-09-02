'use client';

import { useEffect, useState } from 'react';
import { TabBar, IA_TABS } from './tab-bar';
import { apiFetch } from '@/lib/api-client';

interface Attention {
  openGaps: number;
  gapsWithLead: number;
  draftPlaybooks: number;
  pendingSuggestions: number;
}

/**
 * E3 · Pestañas de IA con avisos vivos: lagunas abiertas sobre Asistente y
 * borradores pendientes sobre Seguimientos. El trabajo que espera a una
 * persona deja de vivir en silos.
 */
export function IaTabs() {
  const [attention, setAttention] = useState<Attention | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<Attention>('/reports/attention')
      .then((a) => alive && setAttention(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const items = IA_TABS.map((it) => {
    if (it.href === '/app/knowledge' && attention?.openGaps) {
      return { ...it, badge: attention.openGaps };
    }
    if (it.href === '/app/playbooks' && attention?.draftPlaybooks) {
      return { ...it, badge: attention.draftPlaybooks };
    }
    return it;
  });

  return <TabBar items={items} />;
}
