import type { SVGProps } from 'react';

/** 16px line icons for the editor chrome. Decorative: every use sits next to text or an aria-label. */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export const UndoIcon = () => (
  <Icon><path d="M5.5 3.5 2.5 6.5l3 3" /><path d="M2.5 6.5h7a4 4 0 0 1 0 8h-2" /></Icon>
);
export const RedoIcon = () => (
  <Icon><path d="m10.5 3.5 3 3-3 3" /><path d="M13.5 6.5h-7a4 4 0 0 0 0 8h2" /></Icon>
);
export const WarnIcon = () => (
  <Icon><path d="M8 2 1.5 13.5h13L8 2Z" /><path d="M8 6.5v3" /><path d="M8 11.5v.01" /></Icon>
);
export const CheckIcon = () => (
  <Icon><circle cx="8" cy="8" r="6" /><path d="m5.5 8 1.8 1.8L10.5 6.5" /></Icon>
);
export const LockIcon = () => (
  <Icon><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Icon>
);
export const TipIcon = () => (
  <Icon><circle cx="8" cy="8" r="6" /><path d="M8 7.5v3.5" /><path d="M8 5v.01" /></Icon>
);
export const PlusIcon = () => (
  <Icon><path d="M8 3v10" /><path d="M3 8h10" /></Icon>
);
export const EyeIcon = () => (
  <Icon><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></Icon>
);
export const PanelLeftIcon = () => (
  <Icon><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11" /></Icon>
);
export const PanelRightIcon = () => (
  <Icon><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M10 2.5v11" /></Icon>
);
export const TextIcon = () => (
  <Icon><path d="M2.5 4V2.5h7V4" /><path d="M6 2.5v11" /><path d="M4.5 13.5h3" /><path d="M10 8.5h4" /><path d="M12 8.5v5" /></Icon>
);
export const CloseIcon = () => (
  <Icon><path d="m4 4 8 8" /><path d="m12 4-8 8" /></Icon>
);
