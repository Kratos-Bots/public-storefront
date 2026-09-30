import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { isSafeHref } from '@/builder/define.ts';

/**
 * A `routeLink` value as an anchor: site paths through the router, external links guarded.
 * Anything `isSafeHref` refuses (javascript:, data:, //host, /\host, control chars) — or an
 * empty href — renders inert: the children in a <span>, never a live link.
 */
export function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href === '' || !isSafeHref(href)) {
    return <span className={className}>{children}</span>;
  }
  if (href.startsWith('/')) {
    return <NavLink to={href} end className={className}>{children}</NavLink>;
  }
  return <a href={href} className={className} rel={/^https:/i.test(href) ? 'noopener noreferrer' : undefined}>{children}</a>;
}
