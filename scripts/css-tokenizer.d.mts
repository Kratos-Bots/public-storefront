export interface CssToken {
  type: 'at-keyword' | 'ident' | 'function' | 'string' | 'url' | 'punct';
  value: string;
}

export declare function tokenizeCss(source: string): CssToken[];
