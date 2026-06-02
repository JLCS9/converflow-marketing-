import Link from 'next/link';

interface AppVersion {
  id: string;
  version: string;
  releasedAt: string;
  title: string;
  description: string;
  highlights: Array<{ title: string; description: string }> | null;
}

async function fetchVersions(): Promise<AppVersion[]> {
  // `?.trim() ||` so an empty env var still falls back — `??` doesn't catch "".
  const url = process.env.INTERNAL_API_URL?.trim() || 'http://api:4000';
  try {
    const res = await fetch(`${url}/app-versions`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()) as AppVersion[];
  } catch {
    return [];
  }
}

export const metadata = { title: 'Versiones · converflow.ai' };

export default async function ChangelogPage() {
  const versions = await fetchVersions();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← Volver
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Historial de versiones</h1>
      <p className="mt-2 text-ink-500">
        Cambios y nuevas funcionalidades de la plataforma. Cumplimiento Kit Digital
        (categoría &quot;Actualizable&quot;).
      </p>

      <ol className="mt-10 space-y-8">
        {versions.length === 0 && (
          <li className="rounded-lg border border-ink-100 bg-white p-6 text-sm text-ink-500">
            Aún no se ha publicado ninguna release. Volveremos pronto.
          </li>
        )}
        {versions.map((v) => (
          <li key={v.id} className="rounded-lg border border-ink-100 bg-white p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">
                <span className="font-mono text-primary-700">v{v.version}</span> {v.title}
              </h2>
              <time className="text-xs text-ink-500">
                {new Date(v.releasedAt).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </div>
            <p className="mt-2 text-sm text-ink-700">{v.description}</p>
            {v.highlights && v.highlights.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {v.highlights.map((h, i) => (
                  <li key={i}>
                    <strong>{h.title}.</strong>{' '}
                    <span className="text-ink-700">{h.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
