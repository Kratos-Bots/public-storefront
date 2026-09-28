export const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/** `+` marks at the four corners of the nearest positioned ancestor (hidden under 480px). */
export function Crosshairs() {
  return (
    <>
      {CORNERS.map((c) => <span key={c} className="cb-cross" data-at={c} aria-hidden />)}
    </>
  );
}
