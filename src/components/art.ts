// Tile artwork exported from Figma: one SVG per board position, in an
// outlined (to do) and filled (done) state.
const outlineUrls = import.meta.glob<string>('../assets/figma/outline/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const filledUrls = import.meta.glob<string>('../assets/figma/filled/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const outlineRaw = import.meta.glob<string>('../assets/figma/outline/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const byIndex = (files: Record<string, string>, i: number) =>
  files[Object.keys(files).find((k) => k.endsWith(`/${i}.svg`))!];

export const tileUrl = (icon: number, done: boolean) =>
  byIndex(done ? filledUrls : outlineUrls, icon);

/** Just the star shape from a tile (no frame), for list rows and sheet headers. */
export function iconMarkup(icon: number): string {
  return byIndex(outlineRaw, icon)
    .replace(/<rect[^>]*\/>/g, '')
    .replace(/width="64" height="80" viewBox="0 0 64 80"/, 'viewBox="8 14 48 52"')
    .replace(/preserveAspectRatio="none"/, '')
    .replace(/style="display: block;"/, '');
}
