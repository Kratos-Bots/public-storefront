export declare function scriptKindFor(fileName: string): number;

export declare function forbiddenImports(
  source: string,
  ctx: { fileDir: string; templateRoot: string; isManifest: boolean; fileName?: string },
): string[];

export declare function forbiddenCssImports(
  source: string,
  ctx: { fileDir: string; templateRoot: string },
): string[];
