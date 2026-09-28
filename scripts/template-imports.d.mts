export declare function forbiddenImports(
  source: string,
  ctx: { fileDir: string; templateRoot: string; isManifest: boolean },
): string[];

export declare function forbiddenCssImports(
  source: string,
  ctx: { fileDir: string; templateRoot: string },
): string[];
