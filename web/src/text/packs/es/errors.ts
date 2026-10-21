import type errors from '@/text/keys/errors.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "errors.generic": "Algo ha salido mal",
  "errors.rateLimited": "Demasiados intentos: espera un momento e inténtalo de nuevo",
  "errors.unavailable": "La tienda no está disponible temporalmente",
  "errors.requestFailed": "La solicitud ha fallado",
  "errors.timeout": "La solicitud ha tardado demasiado",
  "errors.network": "Error de red",
  "errors.loginRequired": "Inicia sesión para continuar.",
  "errors.accessDenied": "Tu cuenta no tiene acceso a esta tienda.",
  "errors.registrationClosed": "Esta tienda no admite clientes nuevos ahora mismo.",
} satisfies AreaPack<typeof errors>;
