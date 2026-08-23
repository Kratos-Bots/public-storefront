import { api, unwrap } from '@/api/client.ts';
import type { WhatsappStart, AttemptStatus, LoginResult, TelegramAuthPayload } from '@/types/auth.ts';

export const startWhatsapp = () =>
  unwrap<WhatsappStart>(api.post('storefront/auth/whatsapp/start', { json: {} }));

export const pollAttempt = (id: string) =>
  unwrap<{ status: AttemptStatus }>(api.get(`storefront/auth/attempts/${id}`));

export const completeWhatsapp = (attemptId: string, attemptSecret: string) =>
  unwrap<LoginResult>(api.post('storefront/auth/whatsapp/complete', { json: { attemptId, attemptSecret } }));

export const loginTelegram = (payload: TelegramAuthPayload) =>
  unwrap<LoginResult>(api.post('storefront/auth/telegram', { json: payload }));

export const logout = () => unwrap<null>(api.post('storefront/auth/logout'));
