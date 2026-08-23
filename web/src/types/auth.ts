export interface WhatsappStart { attemptId: string; attemptSecret: string; code: string; waLink: string; expiresAt: string }
export type AttemptStatus = 'pending' | 'completed' | 'expired';
export interface LoginResult { token: string; customer: { id: number; nickname: string | null } }
export interface TelegramAuthPayload { id: number | string; auth_date: number | string; hash: string; first_name?: string; last_name?: string; username?: string; photo_url?: string }
