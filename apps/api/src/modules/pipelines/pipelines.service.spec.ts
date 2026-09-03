import { describe, it, expect } from 'vitest';
import { resolveStageForStatus, syncStatusFromStage } from './pipelines.service.js';

/**
 * Resolución de etapa/estado de un pipeline: única fuente de verdad
 * compartida por el alta manual de una Oportunidad y el alta automática
 * desde una compra de e-commerce.
 */
const stage = (over: Partial<{ id: string; key: string; isWon: boolean; isLost: boolean; order: number }> = {}) => ({
  id: 'x', pipelineId: 'p1', key: 'OPEN', label: 'x', color: '#000', order: 0, isWon: false, isLost: false,
  ...over,
});

describe('resolveStageForStatus', () => {
  it('WON → la etapa marcada isWon', () => {
    const pipeline = { stages: [stage({ id: 'a' }), stage({ id: 'b', isWon: true })] };
    expect(resolveStageForStatus(pipeline, 'WON')?.id).toBe('b');
  });

  it('LOST → la etapa marcada isLost', () => {
    const pipeline = { stages: [stage({ id: 'a' }), stage({ id: 'b', isLost: true })] };
    expect(resolveStageForStatus(pipeline, 'LOST')?.id).toBe('b');
  });

  it('sin ninguna etapa isWon/isLost → cae a la primera etapa', () => {
    const pipeline = { stages: [stage({ id: 'a' }), stage({ id: 'b' })] };
    expect(resolveStageForStatus(pipeline, 'WON')?.id).toBe('a');
  });

  it('status que coincide con una key concreta → esa etapa', () => {
    const pipeline = { stages: [stage({ id: 'a', key: 'OPEN' }), stage({ id: 'b', key: 'NEGOTIATING' })] };
    expect(resolveStageForStatus(pipeline, 'NEGOTIATING')?.id).toBe('b');
  });

  it('pipeline null o sin etapas → undefined, nunca lanza', () => {
    expect(resolveStageForStatus(null, 'WON')).toBeUndefined();
    expect(resolveStageForStatus({ stages: [] }, 'WON')).toBeUndefined();
  });
});

describe('syncStatusFromStage', () => {
  it('la etapa manda sobre lo pedido: isWon siempre da WON', () => {
    expect(syncStatusFromStage(stage({ isWon: true }), 'OPEN')).toBe('WON');
  });

  it('isLost siempre da LOST', () => {
    expect(syncStatusFromStage(stage({ isLost: true }), 'OPEN')).toBe('LOST');
  });

  it('etapa intermedia con key conocida → esa key', () => {
    expect(syncStatusFromStage(stage({ key: 'NEGOTIATING' }), 'OPEN')).toBe('NEGOTIATING');
  });

  it('etapa intermedia con key desconocida y fallback WON/LOST → degrada a OPEN', () => {
    expect(syncStatusFromStage(stage({ key: 'custom' }), 'WON')).toBe('OPEN');
  });
});
