'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import toast from 'react-hot-toast';
import axios from 'axios';
import { apiClient } from '../api/client';
import type { Channel } from '@/lib/alerts/schema';
interface Settings {
  enabled: boolean;
  channels: Channel[];
  maxAgeHours: number;
  includeDiscovered: boolean;
  discordConfigured: boolean;
  slackConfigured: boolean;
}
interface Data {
  settings: Settings;
  email: string | null;
  capabilities: { email: boolean; push: boolean; webhooks: boolean };
  deliveries: {
    id: number;
    channel: string;
    status: string;
    title: string;
    company: string;
    last_error: string | null;
  }[];
}
const label: Record<Channel, string> = {
  email: 'Email',
  discord: 'Discord',
  slack: 'Slack',
  push: 'Browser push',
};
function errorMessage(error: unknown) {
  return axios.isAxiosError(error)
    ? (error.response?.data?.error ?? 'Could not save settings')
    : 'Could not save settings';
}
export function Alerts() {
  const { userId } = useAuth();
  const client = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => (await apiClient.get<Data>('/alerts')).data,
  });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [discord, setDiscord] = useState('');
  const [slack, setSlack] = useState('');
  const [device, setDevice] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    if (data) setDraft(data.settings);
  }, [data]);
  useEffect(() => {
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker
        .getRegistration('/')
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => setDevice(!!s));
  }, []);
  const save = useMutation({
    mutationFn: async () => {
      await apiClient.put('/alerts', {
        ...draft,
        ...(discord ? { discordWebhook: discord } : {}),
        ...(slack ? { slackWebhook: slack } : {}),
      });
    },
    onSuccess: () => {
      setDiscord('');
      setSlack('');
      void client.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert settings saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error(
        'Push is not supported here. Try another browser; on iOS, add JobSieve to your Home Screen.',
      );
      return;
    }
    setPushBusy(true);
    try {
      if ((await Notification.requestPermission()) !== 'granted')
        throw new Error('Notification permission was not granted');
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('Browser push is not configured');
      const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
      const applicationServerKey = Uint8Array.from(binary, (c) =>
        c.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));
      await apiClient.post('/push', subscription.toJSON());
      registration.active?.postMessage({ type: 'account', userId });
      setDevice(true);
      toast.success(
        'Device connected. Select Browser push and save to receive alerts.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not enable push',
      );
    } finally {
      setPushBusy(false);
    }
  }
  async function disablePush() {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await apiClient.delete('/push', { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setDevice(false);
    } catch {
      toast.error('Could not disconnect device');
    } finally {
      setPushBusy(false);
    }
  }
  if (isLoading) return <p>Loading alert settings…</p>;
  if (isError || !data || !draft)
    return <p role="alert">Could not load alerts. Refresh to retry.</p>;
  const input =
    'w-full rounded border border-gray-300 bg-transparent p-2 dark:border-gray-600';
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-gray-900 dark:text-gray-100">
      <div>
        <h1 className="text-2xl font-bold">Early-job alerts</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Get notified about new jobs matching{' '}
          <Link className="text-blue-600 underline" href="/settings">
            your companies, roles and keywords
          </Link>
          . Alerts help you apply sooner; source delays mean delivery is not
          instant.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-5 rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Enable new-job alerts
        </label>
        <label className="block space-y-2">
          <span>Notify within this many hours of posting</span>
          <input
            className={input}
            type="number"
            min={1}
            max={24}
            required
            value={draft.maxAgeHours}
            onChange={(e) =>
              setDraft({ ...draft, maxAgeHours: Number(e.target.value) })
            }
          />
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={draft.includeDiscovered}
            onChange={(e) =>
              setDraft({ ...draft, includeDiscovered: e.target.checked })
            }
          />
          <span>
            Also notify for newly discovered jobs with unknown posting times
            <span className="mt-1 block text-sm text-gray-500">
              These may be older listings. Initial source imports are excluded.
            </span>
          </span>
        </label>
        <fieldset className="space-y-3">
          <legend className="mb-2 font-medium">Delivery channels</legend>
          {(['push', 'email', 'discord', 'slack'] as Channel[]).map(
            (channel) => (
              <label key={channel} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={draft.channels.includes(channel)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      channels: e.target.checked
                        ? [...draft.channels, channel]
                        : draft.channels.filter((c) => c !== channel),
                    })
                  }
                />
                {label[channel]}
              </label>
            ),
          )}
        </fieldset>
        {draft.channels.includes('email') && (
          <p className="text-sm">
            {data.capabilities.email
              ? `Send to your verified account email: ${data.email ?? 'verify an email in your account first'}`
              : 'Email delivery is awaiting sender setup.'}
          </p>
        )}
        {(['discord', 'slack'] as const)
          .filter((c) => draft.channels.includes(c))
          .map((channel) => (
            <label key={channel} className="block space-y-2">
              <span>{label[channel]} webhook URL</span>
              <input
                type="password"
                autoComplete="off"
                className={input}
                value={channel === 'discord' ? discord : slack}
                onChange={(e) =>
                  (channel === 'discord' ? setDiscord : setSlack)(
                    e.target.value,
                  )
                }
                placeholder={
                  draft[
                    channel === 'discord'
                      ? 'discordConfigured'
                      : 'slackConfigured'
                  ]
                    ? 'Saved — leave blank to keep'
                    : 'https://…'
                }
              />
              {!data.capabilities.webhooks && (
                <span className="text-sm">
                  Webhook delivery is awaiting server setup.
                </span>
              )}
            </label>
          ))}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pushBusy || !data.capabilities.push}
            onClick={enablePush}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            {pushBusy
              ? 'Connecting…'
              : device
                ? 'Reconnect this device to your account'
                : 'Enable push on this device'}
          </button>
          {device && (
            <button
              type="button"
              disabled={pushBusy}
              onClick={disablePush}
              className="rounded border px-3 py-2"
            >
              Disconnect device
            </button>
          )}
        </div>
        {!data.capabilities.push && (
          <p className="text-sm text-gray-500">
            Browser push is awaiting server setup.
          </p>
        )}
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save alerts'}
        </button>
      </form>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent notifications</h2>
        {!data.deliveries.length ? (
          <p className="text-sm text-gray-500">
            No notifications yet. Alerts apply to jobs first found after you
            enable them.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.deliveries.map((d) => (
              <li
                key={d.id}
                className="rounded border p-3 dark:border-gray-700"
              >
                <p>
                  {d.title} · {d.company}
                </p>
                <p className="text-sm text-gray-500">
                  {label[d.channel as Channel]} · {d.status}
                </p>
                {d.last_error && (
                  <p className="text-sm text-red-600">{d.last_error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
