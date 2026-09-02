import { describe, it, expect, vi } from 'vitest';
import { AiService } from './ai.service.js';

/**
 * E1 · runAgentLoop con tool terminal: cuando el modelo la llama, el bucle
 * para y devuelve su input tipado sin ejecutarla; las tools normales sí se
 * ejecutan y realimentan.
 */
function makeService(responses: Array<{ content: unknown[]; stop_reason: string }>) {
  const svc = new AiService(
    {} as never, // prisma: no se toca en runAgentLoop
    { addSpend: vi.fn(), load: vi.fn().mockResolvedValue(0) } as never,
  );
  let i = 0;
  const invoke = vi.fn().mockImplementation(() => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve({ ...r, usage: { input_tokens: 10, output_tokens: 5 } });
  });
  (svc as never as { invoke: typeof invoke }).invoke = invoke;
  return { svc, invoke };
}

const TOOLS = [
  { name: 'create_opportunity', description: 'crea', input_schema: { type: 'object' } },
  { name: 'responder', description: 'terminal', input_schema: { type: 'object' } },
];

describe('runAgentLoop · terminalTool', () => {
  it('el modelo llama la terminal a la primera → una sola pasada y input tipado', async () => {
    const { svc, invoke } = makeService([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'responder', input: { reply: 'Hola', can_answer: true } },
        ],
      },
    ]);
    const executeTool = vi.fn();
    const res = await svc.runAgentLoop({
      userPrompt: 'hola',
      tools: TOOLS,
      executeTool,
      terminalTool: 'responder',
    });
    expect(invoke).toHaveBeenCalledOnce();
    expect(executeTool).not.toHaveBeenCalled(); // la terminal NO se ejecuta
    expect(res.terminalInput).toEqual({ reply: 'Hola', can_answer: true });
    expect(res.actions).toHaveLength(0);
  });

  it('tool CRM primero → se ejecuta, realimenta, y la terminal cierra en la 2ª pasada', async () => {
    const { svc, invoke } = makeService([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu1', name: 'create_opportunity', input: { name: 'Curso' } }],
      },
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu2', name: 'responder', input: { reply: 'Anotado.', can_answer: true } },
        ],
      },
    ]);
    const executeTool = vi.fn().mockResolvedValue('Oportunidad creada: "Curso".');
    const res = await svc.runAgentLoop({
      userPrompt: 'quiero comprar',
      tools: TOOLS,
      executeTool,
      terminalTool: 'responder',
      maxIterations: 3,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledWith('create_opportunity', { name: 'Curso' });
    expect(res.actions).toEqual([
      { name: 'create_opportunity', input: { name: 'Curso' }, result: 'Oportunidad creada: "Curso".' },
    ]);
    expect(res.terminalInput).toEqual({ reply: 'Anotado.', can_answer: true });
  });

  it('el modelo cierra con texto libre → terminalInput undefined y el texto queda en result', async () => {
    const { svc } = makeService([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Respuesta suelta' }] },
    ]);
    const res = await svc.runAgentLoop({
      userPrompt: 'hola',
      tools: TOOLS,
      executeTool: vi.fn(),
      terminalTool: 'responder',
    });
    expect(res.terminalInput).toBeUndefined();
    expect(res.result).toBe('Respuesta suelta');
  });
});
