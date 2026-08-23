import { describe, expect, it } from 'vitest';
import { mediaUrl, productImageUrl } from '@/lib/media-url.ts';
describe('media-url', () => {
  it('builds product image urls through /media', () => {
    expect(productImageUrl(12)).toBe('/media/products/12/image?variant=web');
    expect(productImageUrl(12, 'thumbnail')).toBe('/media/products/12/image?variant=thumbnail');
  });
  it('maps backend-relative branding urls', () => {
    expect(mediaUrl('/api/v1/storefront-settings/branding/logo?v=3')).toBe('/media/storefront-settings/branding/logo?v=3');
    expect(mediaUrl('/api/v1/settings/branding/favicon')).toBe('/media/settings/branding/favicon');
    expect(mediaUrl('/api/v1/products/4/image?variant=web')).toBe('/media/products/4/image?variant=web');
  });
  it('passes through absolute http(s) urls and null', () => {
    expect(mediaUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
    expect(mediaUrl(null)).toBeNull();
  });
});
