// Root font size (DESIGN 3.16). Every other size is in rem, so this one value scales the app.
// CSSOM assignment (not a style attribute), so it is allowed under style-src 'self'.
export function applyFontSize(px: number, root: HTMLElement = document.documentElement): void {
  root.style.fontSize = `${px}px`;
}
