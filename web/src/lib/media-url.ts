export function productImageUrl(id: number, variant: 'web' | 'thumbnail' = 'web'): string {
  return `/media/products/${id}/image?variant=${variant}`;
}
export function mediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.replace(/^\/api\/v1\//, '/media/');
}
