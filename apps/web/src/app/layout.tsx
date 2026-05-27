import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'converflow.ai — Agentes de IA para automatizar ventas y atención',
    template: '%s · converflow.ai',
  },
  description:
    'Automatiza ventas, atención al cliente y operaciones con agentes de IA que trabajan sin descanso, integrados en los canales donde ya están tus clientes.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://converflow.ai'),
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'converflow.ai',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0ea5e9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
