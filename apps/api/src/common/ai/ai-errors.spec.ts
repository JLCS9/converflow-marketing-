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
    expect(e.message).toMatch(/agotad/i);
    // Y NUNCA el nombre del proveedor: es información privada de la empresa.
    expect(e.message).not.toMatch(/anthropic|claude|openai/i);
  });

  it('clave inválida o revocada', () => {
    for (const e of [describeAiFailure(err('invalid x-api-key', 401)), describeAiFailure(err('authentication_error', 403))]) {
      expect(e.message).toMatch(/configuraci/i);
      expect(e.message).not.toMatch(/anthropic|api.?key|\.env/i);
    }
  });

  it('modelo inexistente: nombra la variable de entorno a revisar', () => {
    const e = describeAiFailure(err('404 not_found_error: model: claude-inventado', 404));
    // El nombre del modelo es un detalle interno: no puede salir a la interfaz.
    expect(e.message).not.toMatch(/claude|anthropic|model/i);
    expect(e.message).toMatch(/configuraci/i);
  });

  it('límite del proveedor: 429 y sugiere reintentar', () => {
    const e = describeAiFailure(err("rate_limit_error", 429));
    expect(e.httpStatus).toBe(429);
    expect(e.message).toMatch(/reint/i);
  });

  it('sobrecarga del proveedor (529) se trata como indisponibilidad temporal', () => {
    expect(describeAiFailure(err('overloaded_error', 529)).httpStatus).toBe(503);
  });

  it('un fallo desconocido NO filtra el mensaje del proveedor al cliente', () => {
    const e = describeAiFailure(err('anthropic internal: model claude-x exploded'));
    expect(e.httpStatus).toBe(502);
    expect(e.message).not.toMatch(/anthropic|claude/i);
  });

  it('no revienta con un error sin forma de Error', () => {
    expect(() => describeAiFailure(undefined)).not.toThrow();
    expect(() => describeAiFailure('texto pelado')).not.toThrow();
  });
});
