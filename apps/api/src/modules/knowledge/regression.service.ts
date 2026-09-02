import { Injectable, Logger } from '@nestjs/common';
import { AppError, BadRequestError, NotFoundError } from '@converflow/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { KnowledgeService, textSourceRef } from './knowledge.service.js';
import { RagService } from '../rag/rag.service.js';

export interface RegressionResult {
  total: number;
  passed: number;
  /** Checks que estaban en PASS y ahora fallan — los que BLOQUEAN. */
  regressions: { id: string; question: string; expect: string }[];
  /** Checks que fallan pero ya fallaban (o nunca corrieron): informativos. */
  stillFailing: { id: string; question: string }[];
}

/** Normalización para el match determinista: minúsculas y sin acentos. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * F4 · Set de regresión operativo: 30-50 preguntas canónicas por tenant.
 * v1 DETERMINISTA: cada check exige que un fragmento (`expect`) siga
 * apareciendo en el contexto recuperado para su pregunta. Sin juez LLM:
 * barato, rápido y sin falsos positivos de redacción — el juez llegará
 * cuando el piloto lo pida.
 */
@Injectable()
export class RegressionService {
  private readonly logger = new Logger(RegressionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly rag: RagService,
  ) {}

  // ---- CRUD -------------------------------------------------------------------

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.regressionCheck.findMany({ orderBy: { createdAt: 'asc' } }),
    );
  }

  async upsert(tenantId: string, input: { id?: string; question: string; expect: string; active?: boolean }) {
    if (input.question.trim().length < 5 || input.expect.trim().length < 3) {
      throw new BadRequestError('question (5+) y expect (3+) son obligatorios');
    }
    const check = await this.prisma.withTenant(tenantId, async (tx) => {
      const data = {
        question: input.question.trim(),
        expect: input.expect.trim(),
        active: input.active ?? true,
        // Cambiar la pregunta o lo esperado invalida el último estado.
        lastStatus: null,
        lastRunAt: null,
      };
      if (input.id) {
        const existing = await tx.regressionCheck.findUnique({ where: { id: input.id }, select: { id: true } });
        if (!existing) throw new NotFoundError('Check no encontrado');
        return tx.regressionCheck.update({ where: { id: input.id }, data });
      }
      return tx.regressionCheck.create({ data: { tenantId, ...data } });
    });
    // Estado inicial inmediato: un check recién creado ya sabe si pasa.
    await this.runOne(tenantId, check.id).catch(() => undefined);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.regressionCheck.findUnique({ where: { id: check.id } }),
    );
  }

  remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.regressionCheck.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('Check no encontrado');
      await tx.regressionCheck.delete({ where: { id } });
      return { ok: true };
    });
  }

  async hasActiveChecks(tenantId: string): Promise<boolean> {
    const n = await this.prisma.withTenant(tenantId, (tx) =>
      tx.regressionCheck.count({ where: { active: true } }),
    );
    return n > 0;
  }

  // ---- ejecución ----------------------------------------------------------------

  private async runOne(tenantId: string, id: string): Promise<boolean> {
    const check = await this.prisma.withTenant(tenantId, (tx) =>
      tx.regressionCheck.findUnique({ where: { id } }),
    );
    if (!check) return false;
    const pass = await this.evaluate(tenantId, check.question, check.expect);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.regressionCheck.update({
        where: { id },
        data: { lastStatus: pass ? 'PASS' : 'FAIL', lastRunAt: new Date() },
      }),
    );
    return pass;
  }

  /** Evalúa todo el set contra el estado ACTUAL, sin tocar lastStatus. */
  private async evaluateAll(tenantId: string) {
    const checks = await this.prisma.withTenant(tenantId, (tx) =>
      tx.regressionCheck.findMany({ where: { active: true } }),
    );
    const out: { id: string; question: string; expect: string; pass: boolean }[] = [];
    for (const c of checks) {
      out.push({ id: c.id, question: c.question, expect: c.expect, pass: await this.evaluate(tenantId, c.question, c.expect) });
    }
    return out;
  }

  /** PASS antes y FAIL después = regresión que bloquea. */
  private diff(
    before: { id: string; question: string; expect: string; pass: boolean }[],
    after: { id: string; question: string; expect: string; pass: boolean }[],
  ): { total: number; passed: number; regressions: { id: string; question: string; expect: string }[] } {
    const beforeById = new Map(before.map((b) => [b.id, b.pass]));
    return {
      total: after.length,
      passed: after.filter((a) => a.pass).length,
      regressions: after
        .filter((a) => !a.pass && beforeById.get(a.id) === true)
        .map((a) => ({ id: a.id, question: a.question, expect: a.expect })),
    };
  }

  private async evaluate(tenantId: string, question: string, expect: string): Promise<boolean> {
    const blocks = await this.knowledge.retrieve(tenantId, question, { k: 4 }).catch(() => []);
    const haystack = normalize(blocks.map((b) => b.content).join('\n'));
    return haystack.includes(normalize(expect));
  }

  /**
   * Corre TODO el set activo. `commit` = persistir lastStatus (false para
   * la comprobación en staging, donde el estado no debe moverse hasta
   * decidir si el cambio entra).
   */
  async run(tenantId: string, opts: { commit?: boolean } = {}): Promise<RegressionResult> {
    const checks = await this.prisma.withTenant(tenantId, (tx) =>
      tx.regressionCheck.findMany({ where: { active: true } }),
    );
    const result: RegressionResult = { total: checks.length, passed: 0, regressions: [], stillFailing: [] };
    for (const check of checks) {
      const pass = await this.evaluate(tenantId, check.question, check.expect);
      if (pass) result.passed++;
      else if (check.lastStatus === 'PASS') {
        result.regressions.push({ id: check.id, question: check.question, expect: check.expect });
      } else {
        result.stillFailing.push({ id: check.id, question: check.question });
      }
      if (opts.commit !== false) {
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.regressionCheck.update({
            where: { id: check.id },
            data: { lastStatus: pass ? 'PASS' : 'FAIL', lastRunAt: new Date() },
          }),
        );
      }
    }
    return result;
  }

  // ---- cambios de conocimiento GUARDADOS por el set ------------------------------

  /**
   * Alta/sustitución de fuente con el set de regresión como puerta: el
   * contenido anterior queda en staging (`#prev`), el nuevo se vectoriza en
   * síncrono, se corre el set y SOLO si ninguna pregunta que pasaba deja de
   * pasar se consolida. Si rompe, se restaura lo anterior y la petición
   * falla con 409 y la lista de preguntas rotas.
   */
  async guardedAddTextSource(
    tenantId: string,
    opts: { title: string; text: string; meta?: Record<string, unknown> },
  ) {
    if (!(await this.hasActiveChecks(tenantId))) {
      return this.knowledge.addTextSource(tenantId, opts);
    }
    const ref = textSourceRef(opts.title);
    const prev = `${ref}#prev`;
    // Foto ANTES del cambio: bloquea lo que pasaba y deja de pasar — sin
    // depender de lastStatus (que se escribe async y puede llegar tarde).
    const before = await this.evaluateAll(tenantId);
    await this.rag.deleteBySourceRef(tenantId, 'knowledge', prev); // staging huérfano
    await this.rag.renameSourceRef(tenantId, 'knowledge', ref, prev);
    try {
      const res = await this.knowledge.addTextSource(tenantId, opts, { syncEmbed: true });
      const after = await this.evaluateAll(tenantId);
      const check = this.diff(before, after);
      if (check.regressions.length) {
        await this.rag.deleteBySourceRef(tenantId, 'knowledge', ref);
        await this.rag.renameSourceRef(tenantId, 'knowledge', prev, ref);
        throw new AppError(
          'CONFLICT',
          `El cambio rompe ${check.regressions.length} pregunta(s) del set de regresión`,
          409,
          { regressions: check.regressions.map((r) => ({ question: r.question, expect: r.expect })) },
        );
      }
      await this.rag.deleteBySourceRef(tenantId, 'knowledge', prev);
      void this.run(tenantId).catch(() => undefined); // refrescar estados
      return { ...res, regression: { total: check.total, passed: check.passed } };
    } catch (err) {
      if (!(err instanceof AppError && err.httpStatus === 409)) {
        // Fallo técnico (no regresión): restaurar SIEMPRE lo anterior.
        await this.rag.deleteBySourceRef(tenantId, 'knowledge', ref).catch(() => undefined);
        await this.rag.renameSourceRef(tenantId, 'knowledge', prev, ref).catch(() => undefined);
      }
      throw err;
    }
  }

  /** Baja de fuente con la misma puerta: si al quitarla se rompe el set,
   *  la fuente se restaura y la baja queda bloqueada. */
  async guardedDeleteSource(tenantId: string, sourceRef: string) {
    if (!(await this.hasActiveChecks(tenantId))) {
      return this.knowledge.deleteSource(tenantId, sourceRef);
    }
    if (!sourceRef.startsWith('text:')) throw new NotFoundError('Fuente no encontrada');
    const prev = `${sourceRef}#prev`;
    const before = await this.evaluateAll(tenantId);
    await this.rag.renameSourceRef(tenantId, 'knowledge', sourceRef, prev);
    const after = await this.evaluateAll(tenantId);
    const check = this.diff(before, after);
    if (check.regressions.length) {
      await this.rag.renameSourceRef(tenantId, 'knowledge', prev, sourceRef);
      throw new AppError(
        'CONFLICT',
        `Eliminar esta fuente rompe ${check.regressions.length} pregunta(s) del set de regresión`,
        409,
        { regressions: check.regressions.map((r) => ({ question: r.question, expect: r.expect })) },
      );
    }
    await this.rag.deleteBySourceRef(tenantId, 'knowledge', prev);
    void this.run(tenantId).catch(() => undefined);
    return { ok: true };
  }
}
