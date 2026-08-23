import { ApiError, api, unwrap } from '@/api/client.ts';

/** A product unit's own verification record — printed-on-the-label proof it's genuine. */
export interface VerificationResult {
  createdAt: string;
  expiryDate: string;
}

export type VerifyOutcome = { status: 'verified'; data: VerificationResult } | { status: 'invalid' };

/**
 * `GET verify/:verificationCode/:authCode` — the code pair printed on the
 * label is the only credential. A wrong pair answers 404 rather than a
 * pointed error (anti-enumeration: the route can't say *which* code was
 * wrong, or a script could brute-force one half against a fixed other half),
 * so it resolves to `invalid` here instead of throwing. Anything else — the
 * service unreachable, a 5xx — is a real failure and rethrows for the caller
 * to show as a connection error rather than a verdict.
 */
export async function verifyProductUnit(
  verificationCode: string,
  authCode: number,
): Promise<VerifyOutcome> {
  try {
    const data = await unwrap<VerificationResult>(
      api.get(`verify/${encodeURIComponent(verificationCode)}/${authCode}`),
    );
    return { status: 'verified', data };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { status: 'invalid' };
    throw err;
  }
}
