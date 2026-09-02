'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Badge, Field, Input, Textarea, buttonClass } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/empty-state';
import { useFeedback } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import type { GapRow, InstructionRow, RegressionRow, SourceRow, VerifiedRow } from './types';

type Tab = 'sources' | 'gaps' | 'instructions' | 'regression';

interface Props {
  initialSources: SourceRow[];
  initialGaps: GapRow[];
  initialInstructions: InstructionRow[];
  initialVerified: VerifiedRow[];
  initialRegression: RegressionRow[];
}

export function KnowledgePanel({
  initialSources,
  initialGaps,
  initialInstructions,
  initialVerified,
  initialRegression,
}: Props) {
  const t = useTranslations('knowledge');
  const [tab, setTab] = useState<Tab>('sources');
  const [gapCount, setGapCount] = useState(initialGaps.length);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'sources', label: t('tabSources') },
    { key: 'gaps', label: t('tabGaps'), badge: gapCount },
    { key: 'instructions', label: t('tabInstructions') },
    { key: 'regression', label: t('tabRegression') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setTab(it.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tab === it.key
                ? 'bg-ink-900 text-white'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
            )}
          >
            {it.label}
            {it.badge != null && it.badge > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  tab === it.key ? 'bg-white/20 text-white' : 'bg-ink-900 text-white',
                )}
              >
                {it.badge > 99 ? '99+' : it.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'sources' && <SourcesTab initial={initialSources} />}
      {tab === 'gaps' && (
        <GapsTab
          initialGaps={initialGaps}
          initialVerified={initialVerified}
          onGapCount={setGapCount}
        />
      )}
      {tab === 'instructions' && <InstructionsTab initial={initialInstructions} />}
      {tab === 'regression' && <RegressionTab initial={initialRegression} />}
    </div>
  );
}

// =====================================================================
// Fuentes
// =====================================================================

function SourcesTab({ initial }: { initial: SourceRow[] }) {
  const t = useTranslations('knowledge');
  const { toast, confirm } = useFeedback();
  const [sources, setSources] = useState(initial);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(initial.length === 0);

  async function refresh() {
    setSources(await apiFetch<SourceRow[]>('/knowledge/sources'));
  }

  async function addSource() {
    if (title.trim().length < 2 || text.trim().length < 20) {
      toast.error(t('sourceTooShort'));
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ inserted: number }>('/knowledge/sources/text', {
        method: 'POST',
        json: { title: title.trim(), text: text.trim() },
      });
      toast.success(t('sourceAdded', { n: res.inserted }));
      setTitle('');
      setText('');
      setShowForm(false);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const n = (err.detail as { error?: { details?: { regressions?: unknown[] } } })?.error?.details?.regressions?.length ?? 0;
        toast.error(t('regressionBlocked', { n }));
      } else {
        toast.error(t('sourceError'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeSource(row: SourceRow) {
    const ok = await confirm({
      title: t('deleteSourceTitle'),
      description: t('deleteSourceBody', { title: row.title }),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/knowledge/sources?ref=${encodeURIComponent(row.sourceRef)}`, {
        method: 'DELETE',
      });
      toast.success(t('sourceDeleted'));
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const n = (err.detail as { error?: { details?: { regressions?: unknown[] } } })?.error?.details?.regressions?.length ?? 0;
        toast.error(t('regressionBlocked', { n }));
      } else {
        toast.error(t('sourceError'));
      }
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">{t('sourcesHint')}</p>

      {sources.length === 0 && !showForm ? (
        <EmptyState title={t('sourcesEmptyTitle')} description={t('sourcesEmptyBody')} />
      ) : (
        sources.length > 0 && (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-4 py-3">{t('thSource')}</th>
                  <th className="px-4 py-3">{t('thIndexed')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.sourceRef} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink-900">{s.title}</td>
                    <td className="px-4 py-3">
                      {s.embedded === s.chunks ? (
                        <Badge color="green">{t('indexedOk', { n: s.chunks })}</Badge>
                      ) : (
                        <Badge color="yellow">
                          {t('indexedPartial', { done: s.embedded, total: s.chunks })}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void removeSource(s)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        {t('delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {showForm ? (
        <Card className="space-y-4">
          <Field label={t('sourceTitleLabel')}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('sourceTitlePlaceholder')}
              maxLength={120}
            />
          </Field>
          <Field label={t('sourceTextLabel')} help={t('sourceTextHint')}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={t('sourceTextPlaceholder')}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void addSource()}
              disabled={saving}
              className={buttonClass('primary')}
            >
              {saving ? t('saving') : t('addSource')}
            </button>
            {sources.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={buttonClass('ghost')}
              >
                {t('cancel')}
              </button>
            )}
          </div>
        </Card>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className={buttonClass('primary')}>
          {t('newSource')}
        </button>
      )}
    </div>
  );
}

// =====================================================================
// Preguntas sin responder (lagunas) + respuestas verificadas
// =====================================================================

function GapsTab({
  initialGaps,
  initialVerified,
  onGapCount,
}: {
  initialGaps: GapRow[];
  initialVerified: VerifiedRow[];
  onGapCount: (n: number) => void;
}) {
  const t = useTranslations('knowledge');
  const { toast, confirm } = useFeedback();
  const [gaps, setGaps] = useState(initialGaps);
  const [verified, setVerified] = useState(initialVerified);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  async function refreshAll() {
    const [g, v] = await Promise.all([
      apiFetch<GapRow[]>('/knowledge/gaps'),
      apiFetch<VerifiedRow[]>('/knowledge/verified'),
    ]);
    setGaps(g);
    setVerified(v);
    onGapCount(g.length);
  }

  async function coverGap(gap: GapRow) {
    if (answer.trim().length < 2) return;
    setSaving(true);
    try {
      await apiFetch(`/knowledge/gaps/${gap.id}/cover`, {
        method: 'POST',
        json: { answer: answer.trim() },
      });
      toast.success(t('gapCovered'));
      setAnswering(null);
      setAnswer('');
      await refreshAll();
    } catch {
      toast.error(t('gapError'));
    } finally {
      setSaving(false);
    }
  }

  async function dismissGap(gap: GapRow) {
    const ok = await confirm({
      title: t('dismissGapTitle'),
      description: gap.question,
    });
    if (!ok) return;
    try {
      await apiFetch(`/knowledge/gaps/${gap.id}/dismiss`, { method: 'POST' });
      toast.success(t('gapDismissed'));
      await refreshAll();
    } catch {
      toast.error(t('gapError'));
    }
  }

  async function removeVerified(row: VerifiedRow) {
    const ok = await confirm({
      title: t('deleteVerifiedTitle'),
      description: row.question,
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/knowledge/verified/${row.id}`, { method: 'DELETE' });
      toast.success(t('verifiedDeleted'));
      await refreshAll();
    } catch {
      toast.error(t('gapError'));
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-500">{t('gapsHint')}</p>

      {gaps.length === 0 ? (
        <EmptyState title={t('gapsEmptyTitle')} description={t('gapsEmptyBody')} />
      ) : (
        <div className="space-y-3">
          {gaps.map((g) => (
            <Card key={g.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{g.question}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {t('gapAsked', { n: g.count })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {g.hasWaitingLead && <Badge color="red">{t('leadWaiting')}</Badge>}
                </div>
              </div>
              {answering === g.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={4}
                    placeholder={t('answerPlaceholder')}
                    autoFocus
                  />
                  <p className="text-xs text-ink-500">{t('answerHint')}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void coverGap(g)}
                      disabled={saving || answer.trim().length < 2}
                      className={buttonClass('primary', 'text-xs')}
                    >
                      {saving ? t('saving') : t('saveAnswer')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAnswering(null);
                        setAnswer('');
                      }}
                      className={buttonClass('ghost', 'text-xs')}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnswering(g.id);
                      setAnswer('');
                    }}
                    className={buttonClass('secondary', 'text-xs')}
                  >
                    {t('answerGap')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void dismissGap(g)}
                    className={buttonClass('ghost', 'text-xs')}
                  >
                    {t('dismissGap')}
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-900">{t('verifiedTitle')}</h3>
        <p className="text-sm text-ink-500">{t('verifiedHint')}</p>
        {verified.length === 0 ? (
          <p className="text-sm text-ink-400">{t('verifiedEmpty')}</p>
        ) : (
          <Card className="divide-y divide-ink-100 p-0">
            {verified.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{v.question}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-600">{v.answer}</p>
                  {v.verifiedBy && (
                    <p className="mt-1 text-xs text-ink-400">
                      {t('verifiedBy', { who: v.verifiedBy })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void removeVerified(v)}
                  className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                >
                  {t('delete')}
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Instrucciones
// =====================================================================

function InstructionsTab({ initial }: { initial: InstructionRow[] }) {
  const t = useTranslations('knowledge');
  const { toast } = useFeedback();
  const [items, setItems] = useState<string[]>(
    initial.length > 0 ? initial.map((i) => i.content) : [''],
  );
  const [saving, setSaving] = useState(false);

  function setItem(i: number, value: string) {
    setItems((prev) => prev.map((v, j) => (j === i ? value : v)));
  }

  async function save() {
    const cleaned = items.map((v) => v.trim()).filter((v) => v.length >= 3);
    setSaving(true);
    try {
      await apiFetch('/knowledge/instructions', {
        method: 'POST',
        json: { items: cleaned.map((content) => ({ content })) },
      });
      setItems(cleaned.length > 0 ? cleaned : ['']);
      toast.success(t('instructionsSaved'));
    } catch {
      toast.error(t('instructionsError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">{t('instructionsHint')}</p>
      <Card className="space-y-3">
        {items.map((v, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-right font-mono text-xs text-ink-400">
              {i + 1}.
            </span>
            <Textarea
              value={v}
              onChange={(e) => setItem(i, e.target.value)}
              rows={2}
              placeholder={t('instructionPlaceholder')}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              disabled={items.length === 1}
              aria-label={t('delete')}
              className="mt-2 shrink-0 text-ink-400 hover:text-red-600 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, ''])}
            className={buttonClass('ghost', 'text-xs')}
          >
            {t('addInstruction')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={buttonClass('primary', 'text-xs')}
          >
            {saving ? t('saving') : t('saveInstructions')}
          </button>
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// Set de regresión (F4)
// =====================================================================

function RegressionTab({ initial }: { initial: RegressionRow[] }) {
  const t = useTranslations('knowledge');
  const { toast, confirm } = useFeedback();
  const [checks, setChecks] = useState(initial);
  const [question, setQuestion] = useState('');
  const [expect, setExpect] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setChecks(await apiFetch<RegressionRow[]>('/knowledge/regression'));
  }

  async function add() {
    if (question.trim().length < 5 || expect.trim().length < 3) {
      toast.error(t('regFormIncomplete'));
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/knowledge/regression', {
        method: 'POST',
        json: { question: question.trim(), expect: expect.trim() },
      });
      setQuestion('');
      setExpect('');
      toast.success(t('regSaved'));
      await refresh();
    } catch {
      toast.error(t('regError'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: RegressionRow) {
    const ok = await confirm({ title: t('regDeleteTitle'), description: row.question, danger: true });
    if (!ok) return;
    try {
      await apiFetch(`/knowledge/regression/${row.id}`, { method: 'DELETE' });
      await refresh();
    } catch {
      toast.error(t('regError'));
    }
  }

  async function runAll() {
    setBusy(true);
    try {
      const res = await apiFetch<{ total: number; passed: number }>('/knowledge/regression/run', {
        method: 'POST',
      });
      toast.success(t('regRunDone', { passed: res.passed, total: res.total }));
      await refresh();
    } catch {
      toast.error(t('regError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">{t('regHint')}</p>

      {checks.length > 0 && (
        <Card className="divide-y divide-ink-100 p-0">
          {checks.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{c.question}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {t('regExpectLabel')}: «{c.expect}»
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.lastStatus === 'PASS' && <Badge color="green">{t('regPass')}</Badge>}
                {c.lastStatus === 'FAIL' && <Badge color="red">{t('regFail')}</Badge>}
                {c.lastStatus == null && <Badge color="gray">{t('regPending')}</Badge>}
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-4">
        <Field label={t('regQuestionLabel')}>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('regQuestionPlaceholder')}
            maxLength={500}
          />
        </Field>
        <Field label={t('regExpectLabel')} help={t('regExpectHelp')}>
          <Input
            value={expect}
            onChange={(e) => setExpect(e.target.value)}
            placeholder={t('regExpectPlaceholder')}
            maxLength={300}
          />
        </Field>
        <div className="flex gap-2">
          <button type="button" onClick={() => void add()} disabled={busy} className={buttonClass('primary')}>
            {busy ? t('saving') : t('regAdd')}
          </button>
          {checks.length > 0 && (
            <button type="button" onClick={() => void runAll()} disabled={busy} className={buttonClass('secondary')}>
              {t('regRunAll')}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
