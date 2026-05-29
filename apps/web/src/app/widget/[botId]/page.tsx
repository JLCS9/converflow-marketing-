import { WebchatWidget } from './widget-client';

export const metadata = { title: 'Chat' };

// Public, standalone chat surface — embed on any site via an iframe:
//   <iframe src="https://app.converflow.ai/widget/<botId>"></iframe>
export default async function WidgetPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <WebchatWidget botId={botId} />;
}
