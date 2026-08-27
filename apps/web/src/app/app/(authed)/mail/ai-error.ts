import { ApiError } from '@/lib/api-client';

/**
 * Texto a mostrar cuando falla una función de IA.
 *
 * Usa SIEMPRE el mensaje del servidor si viene: `AiService.describeAiFailure`
 * ya devuelve texto accionable y dirigido al usuario («sin saldo, recarga», «la
 * clave no es válida», «revisa ANTHROPIC_DEFAULT_MODEL»).
 *
 * Antes cada componente traducía por su cuenta cualquier 503 a «La IA no está
 * configurada», lo que tapaba precisamente esos motivos: todos ellos son 503.
 */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const msg = err.message?.trim();
    // 'Internal server error' es el texto del filtro genérico: no aporta nada.
    if (msg && msg !== 'Internal server error') return msg;
    if (err.status === 503) return 'La IA no está disponible en este momento.';
    return `No se pudo completar la petición (error ${err.status}).`;
  }
  return 'No se pudo completar la petición';
}
