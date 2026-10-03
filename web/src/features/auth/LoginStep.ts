import { createContext, useContext, useEffect } from 'react';

/**
 * Whether the sign-in is on its opening choice. The heading and the methods are separate
 * builder parts, so the methods report here and the heading reads it: the page's
 * "Choose how you'd like to sign in." belongs to the choice only, and every sub-step
 * (a waiting WhatsApp code, forgot password, create account) carries its own title.
 * Without a provider (the modal) the methods report nowhere and nothing changes.
 */
export const LoginStepContext = createContext<((onChoice: boolean) => void) | null>(null);
export const LoginChoiceContext = createContext(true);

export function useReportChoice(onChoice: boolean): void {
  const report = useContext(LoginStepContext);
  useEffect(() => {
    report?.(onChoice);
    return () => report?.(true);
  }, [report, onChoice]);
}
