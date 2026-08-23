import { api, unwrap } from '@/api/client.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

export const fetchSettings = () => unwrap<StorefrontSettings>(api.get('storefront/settings'));
