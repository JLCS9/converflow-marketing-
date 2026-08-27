import { describe, it, expect } from 'vitest';
import { describeAiFailure } from './ai.service.js';

/**
 * Antes de esto, cualquier fallo del proveedor llegaba al cliente como un
 * 500 «Internal server error» del filtro genérico, así que quedarse sin saldo,
 * una clave revocada y un id de modelo mal escrito eran indistinguibles de un
 * bug nuestro. Es el problema conocido #16: en junio de 2026 se agotó el saldo
 * de Anthropic y el único síntoma fue un WARN en logs — el producto
 * simplemente parecía no hacer nada.
 */
const err = (message: string, status?: number) => Object.assign(new Error(message), { status });

describe('describeAiFailure', () => {
  it('saldo agotado: lo dice y explica qué hacer', () => {
    const e = describeAiFailure(
      err('400 {"error":{"message":"Your credit balance is too low to access the API"}}', 400),
    );
    expect(e.httpStatus).toBe(503);
    expect(e.message).toMatch(/sin saldo/i);
    expect(e.message).toMatch(/recarga/i);
  });

  it('clave inválida o revocada', () => {
    expect(describeAiFailure(err('invalid x-api-key', 401)).message).toMatch(/clave de API/i);
    expect(describeAiFailure(err('authentication_error', 403)).message).toMatch(/clave de API/i);
  });

  it('modelo inexistente: nombra la variable de entorno a revisar', () => {
    const e = describeAiFailure(err('404 not_found_error: model: claude-inventado', 404));
    expect(e.message).toMatch(/ANTHROPIC_DEFAULT_MODEL/);
  });

  it('límite del proveedor: 429 y sugiere reintentar', () => {
    const e = describeAiFailure(err('rate_limit_error', 429));
    expect(e.httpStatus).toBe(429);
    expect(e.message).toMatch(/reint/i);
  });

  it('sobrecarga del proveedor (529) se trata como indisponibilidad temporal', () => {
    expect(describeAiFailure(err('overloaded_error', 529)).httpStatus).toBe(503);
  });

  it('un fallo desconocido conserva el mensaje original, recortado', () => {
    const e = describeAiFailure(err('algo muy raro ha pasado'));
    expect(e.httpStatus).toBe(502);
    expect(e.message).toContain('algo muy raro ha pasado');
  });

  it('no revienta con un error sin forma de Error', () => {
    expect(() => describeAiFailure(undefined)).not.toThrow();
    expect(() => describeAiFailure('texto pelado')).not.toThrow();
  });
});
