import { api, unwrap } from '@/api/client.ts';

export interface PushDevice { id: number; deviceLabel: string; createdAt: string; current: boolean }
export interface PushSubscriptionBody { endpoint: string; keys: { p256dh: string; auth: string } }

export const registerSubscription = (body: PushSubscriptionBody) =>
  unwrap<{ id: number; deviceLabel: string }>(api.post('storefront/push/subscriptions', { json: body }));

/** 204 with no body, so it is not unwrapped. Also 204 for an endpoint that is not the caller's. */
export const deleteSubscription = async (endpoint: string): Promise<void> => {
  await api.delete('storefront/push/subscriptions', { json: { endpoint } });
};

export const fetchPushDevices = (endpoint: string | null) =>
  unwrap<{ devices: PushDevice[] }>(api.get('storefront/push/subscriptions', endpoint ? { searchParams: { endpoint } } : undefined));

/** Owner-scoped; 204 whether or not the device exists. */
export const deletePushDevice = async (id: number): Promise<void> => {
  await api.delete('storefront/push/subscriptions/' + id);
};
