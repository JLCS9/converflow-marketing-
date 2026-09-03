import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/primitives';

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('help.metaTitle') };
}

interface Section {
  id: string;
  titleKey: string;
}

const SECTIONS: Section[] = [
  { id: 'primeros-pasos', titleKey: 'sections.gettingStarted' },
  { id: 'agentes', titleKey: 'sections.agents' },
  { id: 'bots', titleKey: 'sections.bots' },
  { id: 'importar', titleKey: 'sections.importCsv' },
  { id: 'score-ia', titleKey: 'sections.aiScoring' },
  { id: 'oportunidades', titleKey: 'sections.opportunities' },
  { id: 'ecommerce', titleKey: 'sections.ecommerce' },
  { id: 'campos', titleKey: 'sections.fields' },
  { id: 'usuarios', titleKey: 'sections.users' },
  { id: 'desarrollador', titleKey: 'sections.api' },
  { id: 'faq', titleKey: 'sections.faq' },
  { id: 'aviso-ia', titleKey: 'sections.aiNotice' },
];

/**
 * In-app help center. One page, anchored sections, sticky TOC on the side.
 * Purpose: in-product documentation (Kit Digital evidence) + day-to-day
 * onboarding for new tenants. Plain-language, screenshot-friendly.
 */
export default async function HelpCenterPage() {
  const t = await getTranslations('help');

  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const em = (chunks: React.ReactNode) => <em>{chunks}</em>;
  const code = (chunks: React.ReactNode) => <code>{chunks}</code>;
  const support = (chunks: React.ReactNode) => (
    <a href="mailto:soporte@converflow.ai" className="text-primary-700 hover:underline">
      {chunks}
    </a>
  );
  const appLink = (href: string) => {
    const render = (chunks: React.ReactNode) => (
      <Link href={href} className="text-primary-700 hover:underline">
        {chunks}
      </Link>
    );
    render.displayName = 'HelpAppLink';
    return render;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={t('title')} description={t.rich('intro', { support })} />

      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        {/* Sticky TOC */}
        <aside className="md:sticky md:top-4 md:self-start">
          <nav
            aria-label={t('tocAria')}
            className="rounded-md border border-ink-100 bg-white p-3 text-sm"
          >
            <div className="mb-2 text-[10px] font-mono uppercase tracking-wider text-ink-500">
              {t('contents')}
            </div>
            <ol className="space-y-1">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded px-2 py-1 text-ink-700 hover:bg-ink-100 hover:text-ink-900"
                  >
                    <span className="mr-1 font-mono text-[10px] text-ink-400">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {t(s.titleKey)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        {/* Sections */}
        <div className="space-y-6">
          <Section id="primeros-pasos" title={t('sections.gettingStarted')}>
            <p>{t.rich('gs.intro', { strong })}</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t.rich('gs.step1', { strong, link: appLink('/app/profile') })}</li>
              <li>{t.rich('gs.step2', { strong, link: appLink('/app/agents/new') })}</li>
              <li>{t.rich('gs.step3', { strong, link: appLink('/app/bots') })}</li>
              <li>{t.rich('gs.step4', { strong })}</li>
            </ol>
            <p className="text-xs text-ink-500">{t('gs.tip')}</p>
          </Section>

          <Section id="agentes" title={t('sections.agents')}>
            <p>{t.rich('ag.intro', { strong })}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('ag.item1', { strong })}</li>
              <li>{t.rich('ag.item2', { strong })}</li>
              <li>{t.rich('ag.item3', { strong })}</li>
            </ul>
            <p>{t.rich('ag.outro', { strong, link: appLink('/app/agents/new') })}</p>
          </Section>

          <Section id="bots" title={t('bt.header')}>
            <p>{t.rich('bt.intro', { strong })}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('bt.mode1', { strong })}</li>
              <li>{t.rich('bt.mode2', { strong })}</li>
              <li>{t.rich('bt.mode3', { strong })}</li>
            </ul>
            <p>{t('bt.channelsIntro')}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('bt.webchat', { strong, link: appLink('/app/bots') })}</li>
              <li>{t.rich('bt.whatsapp', { strong, link: appLink('/app/conversations') })}</li>
              <li>{t.rich('bt.email', { strong })}</li>
            </ul>
          </Section>

          <Section id="importar" title={t('sections.importCsv')}>
            <p>{t.rich('im.intro', { link: appLink('/app/leads/import') })}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('im.item1', { code })}</li>
              <li>{t.rich('im.item2', { em })}</li>
              <li>{t('im.item3')}</li>
              <li>{t.rich('im.item4', { code })}</li>
              <li>{t.rich('im.item5', { strong })}</li>
            </ul>
          </Section>

          <Section id="score-ia" title={t('sections.aiScoring')}>
            <p>{t.rich('sc.intro', { link: appLink('/app/leads') })}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('sc.item1', { strong })}</li>
              <li>{t.rich('sc.item2', { strong })}</li>
              <li>{t.rich('sc.item3', { strong, em })}</li>
            </ul>
          </Section>

          <Section id="oportunidades" title={t('sections.opportunities')}>
            <p>{t('op.intro')}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('op.item1', { link: appLink('/app/settings/pipelines') })}</li>
              <li>{t('op.item2')}</li>
              <li>{t('op.item3')}</li>
            </ul>
          </Section>

          <Section id="ecommerce" title={t('sections.ecommerce')}>
            <p>{t('ec.intro')}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('ec.item1', { link: appLink('/app/settings/integrations') })}</li>
              <li>{t('ec.item2')}</li>
              <li>{t('ec.item3')}</li>
              <li>{t.rich('ec.item4', { link: appLink('/app/opportunities') })}</li>
            </ul>
          </Section>

          <Section id="campos" title={t('sections.fields')}>
            <p>{t('fl.intro')}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('fl.item1', { link: appLink('/app/settings/fields') })}</li>
              <li>{t('fl.item2')}</li>
              <li>{t('fl.item3')}</li>
              <li>{t('fl.item4')}</li>
            </ul>
          </Section>

          <Section id="usuarios" title={t('sections.users')}>
            <p>{t.rich('us.intro', { code, link: appLink('/app/users') })}</p>

            <h3>{t('us.rolesTitle')}</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('us.role1', { strong })}</li>
              <li>{t.rich('us.role2', { strong })}</li>
              <li>{t.rich('us.role3', { strong })}</li>
              <li>{t.rich('us.role4', { strong })}</li>
            </ul>

            <h3>{t('us.permTableTitle')}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t('us.colModule')}</th>
                  <th>{t('us.colOwner')}</th>
                  <th>{t('us.colAdmin')}</th>
                  <th>{t('us.colBuilder')}</th>
                  <th>{t('us.colAgent')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('us.rowCrm')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>{t('us.rowConversations')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>{t('us.rowDocuments')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>{t('us.rowAgents')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>{t('us.rowBots')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>{t('us.rowScore')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>{t('us.rowImport')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>{t('us.rowSettings')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>{t('us.rowManageUsers')}</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-ink-500">{t('us.legend')}</p>

            <h3>{t('us.inviteTitle')}</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t.rich('us.invite1', { link: appLink('/app/users/new') })}</li>
              <li>{t('us.invite2')}</li>
              <li>{t('us.invite3')}</li>
              <li>{t.rich('us.invite4', { strong, code })}</li>
              <li>{t.rich('us.invite5', { strong })}</li>
              <li>{t('us.invite6')}</li>
            </ol>

            <h3>{t('us.editTitle')}</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t.rich('us.edit1', { strong })}</li>
              <li>{t('us.edit2')}</li>
              <li>{t.rich('us.edit3', { strong })}</li>
              <li>{t('us.edit4')}</li>
            </ol>
            <p className="text-xs text-ink-500">{t.rich('us.ownerNote', { strong })}</p>

            <h3>{t('us.uiTitle')}</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('us.ui1', { strong })}</li>
              <li>{t.rich('us.ui2', { strong })}</li>
              <li>{t('us.ui3')}</li>
              <li>{t('us.ui4')}</li>
            </ul>

            <h3>{t('us.deleteTitle')}</h3>
            <p>{t.rich('us.deleteBody', { strong })}</p>
            <p className="text-xs text-ink-500">{t('us.deleteNote')}</p>
          </Section>

          <Section id="desarrollador" title={t('sections.api')}>
            <p>{t.rich('dev.intro', { link: appLink('/app/settings/developer') })}</p>

            <h3>{t('dev.authTitle')}</h3>
            <p>{t.rich('dev.authIntro', { code })}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t.rich('dev.auth1', { code })}</li>
              <li>{t('dev.auth2')}</li>
              <li>{t('dev.auth3')}</li>
              <li>{t('dev.auth4')}</li>
            </ul>

            <h3>{t('dev.baseUrlTitle')}</h3>
            <p>
              {t('dev.baseUrlPre')}{' '}
              <code>https://api.converflow.ai/v1/&lt;{t('dev.resourceWord')}&gt;</code>.{' '}
              {t('dev.baseUrlPost')}
            </p>

            <h3>{t('dev.resourcesTitle')}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t('dev.colResource')}</th>
                  <th>{t('dev.colPermission')}</th>
                  <th>{t('dev.colOperations')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>/v1/leads</code>
                  </td>
                  <td>
                    <code>crm</code>
                  </td>
                  <td>{t('dev.opsCrud')}</td>
                </tr>
                <tr>
                  <td>
                    <code>/v1/clients</code>
                  </td>
                  <td>
                    <code>crm</code>
                  </td>
                  <td>{t('dev.opsCrud')}</td>
                </tr>
                <tr>
                  <td>
                    <code>/v1/opportunities</code>
                  </td>
                  <td>
                    <code>crm</code>
                  </td>
                  <td>{t('dev.opsOpportunities')}</td>
                </tr>
                <tr>
                  <td>
                    <code>/v1/tasks</code>
                  </td>
                  <td>
                    <code>crm</code>
                  </td>
                  <td>{t('dev.opsTasks')}</td>
                </tr>
                <tr>
                  <td>
                    <code>/v1/notes</code>
                  </td>
                  <td>
                    <code>crm</code>
                  </td>
                  <td>{t('dev.opsNotes')}</td>
                </tr>
                <tr>
                  <td>
                    <code>/v1/conversations</code>
                  </td>
                  <td>
                    <code>conversations</code>
                  </td>
                  <td>{t('dev.opsConversations')}</td>
                </tr>
                <tr>
                  <td>
                    <code>/v1/documents</code>
                  </td>
                  <td>
                    <code>documents</code>
                  </td>
                  <td>{t('dev.opsDocuments')}</td>
                </tr>
              </tbody>
            </table>

            <h3>{t('dev.examplesTitle')}</h3>
            <pre className="overflow-x-auto rounded-md border border-ink-100 bg-ink-900 p-3 text-xs text-emerald-100">
{`# ${t('dev.exampleList')}
curl -s "https://api.converflow.ai/v1/leads?limit=50" \\
  -H "Authorization: Bearer cfai_XXXXXXXXXXXXXXXXXXXXXXXXXXXX" \\
  | jq .

# ${t('dev.exampleCreate')}
curl -s -X POST "https://api.converflow.ai/v1/leads" \\
  -H "Authorization: Bearer cfai_XXXXXXXXXXXXXXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Marta García",
    "email": "marta@example.com",
    "phone": "+34666111222",
    "source": "web"
  }'

# ${t('dev.exampleGetConv')}
curl -s "https://api.converflow.ai/v1/conversations/<id>" \\
  -H "Authorization: Bearer cfai_XXXXXXXXXXXXXXXXXXXXXXXXXXXX"`}
            </pre>

            <h3>{t('dev.errorsTitle')}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t('dev.colCode')}</th>
                  <th>{t('dev.colCause')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>401</td>
                  <td>{t.rich('dev.err401', { code })}</td>
                </tr>
                <tr>
                  <td>403</td>
                  <td>{t('dev.err403')}</td>
                </tr>
                <tr>
                  <td>404</td>
                  <td>{t('dev.err404')}</td>
                </tr>
                <tr>
                  <td>409</td>
                  <td>{t('dev.err409')}</td>
                </tr>
                <tr>
                  <td>422</td>
                  <td>{t('dev.err422')}</td>
                </tr>
                <tr>
                  <td>5xx</td>
                  <td>{t('dev.err5xx')}</td>
                </tr>
              </tbody>
            </table>

            <h3>{t('dev.bestTitle')}</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t('dev.best1')}</li>
              <li>{t.rich('dev.best2', { code })}</li>
              <li>{t('dev.best3')}</li>
              <li>{t('dev.best4')}</li>
            </ul>

            <h3>{t('dev.webhooksTitle')}</h3>
            <p className="text-xs text-ink-500">{t.rich('dev.webhooksBody', { support })}</p>
          </Section>

          <Section id="faq" title={t('sections.faq')}>
            <dl className="space-y-4">
              <FaqItem q={t('faq.q1')} a={t('faq.a1')} />
              <FaqItem q={t('faq.q2')} a={t('faq.a2')} />
              <FaqItem q={t('faq.q3')} a={t('faq.a3')} />
              <FaqItem q={t('faq.q4')} a={t('faq.a4')} />
              <FaqItem q={t('faq.q5')} a={t('faq.a5')} />
              <FaqItem q={t('faq.q6')} a={t('faq.a6')} />
              <FaqItem q={t('faq.q7')} a={t('faq.a7')} />
              <FaqItem q={t('faq.q8')} a={t('faq.a8')} />
              <FaqItem q={t('faq.q9')} a={t('faq.a9')} />
            </dl>
          </Section>

          <Section id="aviso-ia" title={t('sections.aiNotice')}>
            <p>{t('ai.intro')}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                {t.rich('ai.disclosure', {
                  link: (chunks: React.ReactNode) => (
                    <Link href="/ai-disclosure" target="_blank" className="text-primary-700 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </li>
              <li>
                {t.rich('ai.privacy', {
                  link: (chunks: React.ReactNode) => (
                    <Link href="/privacy" target="_blank" className="text-primary-700 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </li>
              <li>
                {t.rich('ai.changelog', {
                  link: (chunks: React.ReactNode) => (
                    <Link href="/changelog" target="_blank" className="text-primary-700 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </li>
            </ul>
            <p className="text-xs text-ink-500">
              {t.rich('ai.contact', {
                legal: (chunks: React.ReactNode) => (
                  <a href="mailto:legal@converflow.ai" className="text-primary-700 hover:underline">
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </Section>

          <div className="rounded-md border border-ink-100 bg-ink-100/30 p-4 text-sm text-ink-600">
            {t.rich('footer', { support })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <Card>
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
        <div className="mt-3 space-y-3 text-sm text-ink-700">{children}</div>
      </Card>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-medium text-ink-900">{q}</dt>
      <dd className="mt-1 text-ink-700">{a}</dd>
    </div>
  );
}
