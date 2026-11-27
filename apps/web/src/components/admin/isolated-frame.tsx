'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/client-api';
import { readBlockChange, readBridgeCall } from './bridge-message';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function IsolatedFrame({
  title,
  src,
  pluginId,
  className,
  attributes,
  allowedKeys,
  onAttributes,
}: {
  title: string;
  src: string;
  pluginId: string;
  className?: string;
  attributes?: Record<string, unknown>;
  allowedKeys?: string[];
  onAttributes?: (next: Record<string, string | number | boolean>) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const keys = allowedKeys ?? [];
  const keysKey = keys.join('|');
  const current = attributes ?? {};

  useEffect(() => {
    const allowed = keysKey ? keysKey.split('|') : [];
    function onMessage(event: MessageEvent) {
      const child = frame.current?.contentWindow;
      if (!child || event.source !== child || event.origin !== 'null') return;
      const call = readBridgeCall(event.data);
      if (call) {
        const reply = (ok: boolean, data: unknown, error?: string) => {
          if (frame.current?.contentWindow !== child) return;
          child.postMessage({ type: 'openpress:result', id: call.id, ok, data, error }, '*');
        };
        api(`/plugins/${pluginId}/rest${call.path}`, {
          method: call.method,
          body: call.method === 'GET' ? undefined : JSON.stringify(call.body ?? {}),
        })
          .then((data) => reply(true, data))
          .catch((err) => reply(false, null, err instanceof Error ? err.message : 'Request failed'));
        return;
      }
      const next = readBlockChange(event.data, allowed);
      if (next && onAttributes) onAttributes(next);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pluginId, keysKey, onAttributes]);

  function sendAttributes() {
    const child = frame.current?.contentWindow;
    if (!child) return;
    const payload: Record<string, unknown> = {};
    for (const key of keys) payload[key] = current[key];
    child.postMessage({ type: 'openpress:block', attributes: payload }, '*');
  }

  return (
    <iframe
      ref={frame}
      className={className}
      sandbox="allow-scripts"
      title={title}
      src={`${API_URL}${src}`}
      onLoad={sendAttributes}
    />
  );
}
