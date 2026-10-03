import { create } from 'zustand';

/**
 * What the backend has told this browser about the signed-in customer's access.
 * Not persisted: a reload asks again, which is how a newly allowed customer
 * gets in.
 */
export const accessGate = create<{
  denied: boolean;
  registrationRefused: boolean;
  setDenied: (v: boolean) => void;
  setRegistrationRefused: (v: boolean) => void;
  reset: () => void;
}>((set) => ({
  denied: false,
  registrationRefused: false,
  setDenied: (denied) => set({ denied }),
  setRegistrationRefused: (registrationRefused) => set({ registrationRefused }),
  reset: () => set({ denied: false, registrationRefused: false }),
}));
