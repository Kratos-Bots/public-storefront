export type CssToken =
  | {
      type: 'ident' | 'function' | 'at-keyword' | 'hash' | 'string' | 'bad-string' | 'url' | 'bad-url'
        | 'number' | 'percentage' | 'delim' | 'cdo' | 'cdc' | 'punct';
      value: string;
    }
  | { type: 'dimension'; value: string; unit: string };

export interface TokenizeOptions {
  /** 'all' (default): every code point >= U+0080 is an ident code point, as in browsers. 'spec': css-syntax-3 ranges only. */
  nonAsciiIdent?: 'all' | 'spec';
}

export declare function preprocessCss(source: string): string;
export declare function tokenizeCss(source: string, options?: TokenizeOptions): CssToken[];
