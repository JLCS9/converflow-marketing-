import { MessageCircle, Mail, MessageSquare, Camera } from 'lucide-react';
import { CHANNEL } from '@/lib/labels';

interface Props {
  channel: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

const ICON: Record<string, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  WEBCHAT: MessageSquare,
  INSTAGRAM: Camera,
  MESSENGER: MessageCircle,
};

// Colors picked to read at a glance but stay quiet next to text.
const STYLE: Record<string, string> = {
  WHATSAPP: 'bg-emerald-100 text-emerald-700',
  EMAIL: 'bg-blue-100 text-blue-700',
  WEBCHAT: 'bg-violet-100 text-violet-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  MESSENGER: 'bg-sky-100 text-sky-700',
};

export function ChannelBadge({ channel, size = 14, showLabel = false, className }: Props) {
  const Icon = ICON[channel] ?? MessageSquare;
  const style = STYLE[channel] ?? 'bg-ink-100 text-ink-700';
  const label = CHANNEL[channel] ?? channel;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${style} ${
        showLabel ? 'px-2 py-0.5' : 'p-1'
      } ${className ?? ''}`}
      title={label}
      aria-label={label}
    >
      <Icon size={size} strokeWidth={1.75} aria-hidden />
      {showLabel && <span className="text-xs font-medium">{label}</span>}
    </span>
  );
}
