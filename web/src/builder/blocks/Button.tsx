import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { z } from 'zod';
import { defineBlock, isSafeHref, routeLink, type StyleAttrs } from '@/builder/define.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import classes from '@/builder/blocks/Button.module.css';

type Props = { id: string; label: string; href: string; variant: 'filled' | 'default' | 'subtle'; align: 'start' | 'center' | 'stretch' };

function ButtonView({ label, href, variant, align, styleAttrs }: Omit<Props, 'id'> & { styleAttrs?: StyleAttrs }) {
  // Same gate SmartLink applies; a button with no safe destination (or no label) renders nothing at all.
  if (!href || !isSafeHref(href) || !label.trim()) return null;
  const shared = { variant, size: 'md' as const, fullWidth: align === 'stretch', className: classes.button, 'data-sf-part': 'button' };
  return (
    <div className={classes[align]} data-sf-block="Button" {...styleAttrs}>
      {href.startsWith('/') ? (
        <Button component={Link} to={href} {...shared}>{label}</Button>
      ) : (
        <Button component="a" href={href} rel={/^https:/i.test(href) ? 'noopener noreferrer' : undefined} {...shared}>{label}</Button>
      )}
    </div>
  );
}

export const block = defineBlock<Props>({
  name: 'Button', label: 'Button', category: 'content', layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  schema: z.object({ label: z.string().min(1).max(60), href: routeLink(), variant: z.enum(['filled', 'default', 'subtle']), align: z.enum(['start', 'center', 'stretch']) }),
  defaultProps: { label: 'Shop now', href: '/', variant: 'filled', align: 'start' },
  render: ({ label, href, variant, align, puck }) => <ButtonView label={label} href={href} variant={variant} align={align} styleAttrs={puck.style} />,
});
