import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import classes from '@/builder/blocks/Video.module.css';

type Props = { id: string; provider: 'youtube' | 'vimeo'; videoId: string; title: string };

const ID = { youtube: /^[A-Za-z0-9_-]{11}$/, vimeo: /^\d{6,12}$/ } as const;

export function embedUrl(provider: Props['provider'], videoId: string): string | null {
  if (!ID[provider].test(videoId)) return null;
  return provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${videoId}` : `https://player.vimeo.com/video/${videoId}?dnt=1`;
}

/** An id, never a URL: the embed host is fixed here, so an owner can't point an iframe anywhere else. */
export const block = defineBlock<Props>({
  name: 'Video', label: 'Video', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ provider: z.enum(['youtube', 'vimeo']), videoId: z.string().max(20), title: z.string().min(1).max(120) }),
  defaultProps: { provider: 'youtube', videoId: '', title: 'Video' },
  render: ({ provider, videoId, title }) => {
    const src = embedUrl(provider, videoId);
    if (!src) return null;
    return (
      <div className={classes.frame} data-sf-block="Video">
        <iframe
          className={classes.player}
          src={src}
          title={title}
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    );
  },
});
