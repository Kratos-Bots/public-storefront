import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

/** A `routeLink` value as an anchor: site paths through the router, external links guarded. */
export function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith('/')) {
    return <NavLink to={href} end className={className}>{children}</NavLink>;
  }
  return <a href={href} className={className} rel={/^https:/i.test(href) ? 'noopener noreferrer' : undefined}>{children}</a>;
}
