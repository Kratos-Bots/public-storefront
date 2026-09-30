import type { StyleKey } from '@/builder/style/model.ts';

/** Editor row labels for the Style group; also named in the guard's issue messages. Editor UI, not shop text. */
export const STYLE_LABELS: Record<StyleKey, string> = {
  bg: 'Background',
  fg: 'Text colour',
  padTop: 'Padding top',
  padBottom: 'Padding bottom',
  padX: 'Padding sides',
  marginTop: 'Space above',
  marginBottom: 'Space below',
  border: 'Border width',
  borderColor: 'Border colour',
  borderStyle: 'Border style',
  radius: 'Corners',
  shadow: 'Shadow',
  textSize: 'Text size',
  align: 'Alignment',
  maxWidth: 'Max width',
  hide: 'Visibility',
};
