'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, Textarea, buttonClass } from '@/components/ui/primitives';

interface Bot {
  id: string;
  name: string;
  channel: string;
}
interface TenantUser {
  id: string;
  name: string;
  email: string;
}

export interface CampaignData {
  id: string;
  name: string;
  channel: string;
  botId: string | null;
  subject: string | null;
  body: string;
  status: string;
  scheduledAt: string | null;
  audience: {
    entity?: string;
    statuses?: string[];
    sources?: string[];
    ownerId?: string;
  } | null;
}

interface Preview {
  total: number;
  suppressed: number;
  sample: { name: string | null; address: string }[];
}

const CHANNELS = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
];

export function CampaignForm({ campaign }: { campaign?: CampaignData }) {
  const router = useRouter();
  const a = campaign?.audience ?? {};

  const [name, setName] = useState(campaign?.name ?? '');
  const [channel, setChannel] = useState(campaign?.channel ?? 'EMAIL');
  const [botId, setBotId] = useState(campaign?.botId ?? '');
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [body, setBody] = useState(campaign?.body ?? '');

  const [entity, setEntity] = useState(a.entity ?? 'BOTH');
  const [statuses, setStatuses] = useState((a.statuses ?? []).join(', '));
  const [sources, setSources] = useState((a.sources ?? []).join(', '));
  const [ownerId, setOwnerId] = useState(a.ownerId ?? '');

  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>(
    campaign?.scheduledAt ? 'later' : 'now',
  );
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduledAt ? toLocalInput(campaign.scheduledAt) : '',
  );

  const [bots, setBots] = useState<Bot[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    apiFetch<Bot[]>('/bots')
      .then((b) => active && setBots(Array.isArray(b) ? b : []))
      .catch(() => undefined);
    apiFetch<TenantUser[]>('/users/assignable')
      .then((u) => active && setUsers(Array.isArray(u) ? u : []))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const channelBots = bots.filter((b) => b.channel === channel);

  function buildAudience() {
    const toList = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    return {
      entity,
      statuses: toList(statuses),
      sources: toList(sources),
      ownerId: ownerId || undefined,
    };
  }

  function buildPayload() {
    return {
      name: name.trim(),
      channel,
      botId: botId || undefined,
      subject: channel === 'EMAIL' ? subject.trim() : undefined,
      body: body.trim(),
      audience: buildAudience(),
      scheduledAt:
        scheduleMode === 'later' && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    };
  }

  async function doPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const res = await apiFetch<Preview>('/campaigns/preview', {
        method: 'POST',
        json: { channel, audience: buildAudience() },
      });
      setPreview(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo previsualizar');
    } finally {
      setPreviewing(false);
    }
  }

  function save(thenLaunch: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        let id = campaign?.id;
        if (id) {
          await apiFetch(`/campaigns/${id}`, { method: 'PATCH', json: buildPayload() });
        } else {
          const created = await apiFetch<{ id: string }>('/campaigns', {
            method: 'POST',
            json: buildPayload(),
          });
          id = created.id;
        }
        if (thenLaunch && id) {
          await apiFetch(`/campaigns/${id}/launch`, { method: 'POST' });
        }
        router.push(`/app/campaigns/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  return (
    <Card>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Canal" required>
            <Select
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value);
                setBotId('');
                setPreview(null);
              }}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label={channel === 'EMAIL' ? 'Bandeja de envío' : 'Bot de WhatsApp'}
          help={
            channel === 'EMAIL'
              ? 'Se envía desde el buzón conectado del bot; si eliges "Sistema", sale por Converflow (Resend).'
              : 'El número de WhatsApp conectado desde el que se enviará.'
          }
        >
          <Select value={botId} onChange={(e) => setBotId(e.target.value)}>
            <option value="">{channel === 'EMAIL' ? 'Sistema (Resend)' : '— Selecciona un bot —'}</option>
            {channelBots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>

        {channel === 'EMAIL' && (
          <Field label="Asunto" required>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
        )}

        <Field
          label="Mensaje"
          required
          help="Variables disponibles: {nombre}, {first_name}, {email}, {telefono}. En email se añade un pie de baja automático."
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={channel === 'EMAIL' ? 8 : 5}
            placeholder={'Hola {first_name},\n\n…'}
          />
        </Field>

        {/* ── Audiencia ─────────────────────────────────────────── */}
        <div className="rounded-md border border-ink-100 bg-ink-100/40 p-4 space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-ink-500">Audiencia</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contactos">
              <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="BOTH">Leads y clientes</option>
                <option value="LEAD">Solo leads</option>
                <option value="CLIENT">Solo clientes</option>
              </Select>
            </Field>
            <Field label="Responsable">
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Cualquiera</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estados" help="Coma. Vacío = todos.">
              <Input
                value={statuses}
                onChange={(e) => setStatuses(e.target.value)}
                placeholder="LEAD, CLIENT"
              />
            </Field>
          </div>
          <Field label="Fuentes (origen)" help="Coma. Vacío = todas.">
            <Input
              value={sources}
              onChange={(e) => setSources(e.target.value)}
              placeholder="web, import, whatsapp"
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void doPreview()}
              className={buttonClass('secondary')}
              disabled={previewing}
            >
              {previewing ? 'Calculando…' : 'Previsualizar audiencia'}
            </button>
            {preview && (
              <span className="text-sm text-ink-700">
                <strong>{preview.total}</strong> destinatarios
                {preview.suppressed > 0 && (
                  <span className="text-ink-500"> · {preview.suppressed} dados de baja excluidos</span>
                )}
              </span>
            )}
          </div>
          {preview && preview.sample.length > 0 && (
            <p className="text-xs text-ink-500">
              Ej.: {preview.sample.map((s) => s.name || s.address).slice(0, 5).join(', ')}
              {preview.total > 5 ? '…' : ''}
            </p>
          )}
          <p className="text-[11px] text-ink-400">
            El ajuste manual de contactos concretos llegará en una próxima iteración; por ahora la
            audiencia se define por estos filtros.
          </p>
        </div>

        {/* ── Programación ──────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-ink-900">¿Cuándo enviar?</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scheduleMode === 'now'}
              onChange={() => setScheduleMode('now')}
            />
            Enviar al lanzar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scheduleMode === 'later'}
              onChange={() => setScheduleMode('later')}
            />
            Programar
            {scheduleMode === 'later' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="ml-2 rounded-md border border-ink-300 px-2 py-1 text-sm"
              />
            )}
          </label>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/campaigns')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => save(false)}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            {pending ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            className={buttonClass('primary')}
            disabled={pending}
          >
            {scheduleMode === 'later' ? 'Guardar y programar' : 'Guardar y enviar'}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ISO → value for <input type="datetime-local"> in local time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
