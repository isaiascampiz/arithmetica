export const accents = [
  { id: 'teal', label: 'Teal', light: '#247872', dark: '#84cdc1' },
  { id: 'blue', label: 'Blue', light: '#315ea8', dark: '#9cbcff' },
  { id: 'violet', label: 'Violet', light: '#7150a0', dark: '#c8acf0' },
  { id: 'amber', label: 'Amber', light: '#8a5a14', dark: '#e7c183' },
  { id: 'rose', label: 'Rose', light: '#a14e69', dark: '#eab0bd' },
  { id: 'emerald', label: 'Emerald', light: '#247347', dark: '#94d4ab' },
  { id: 'cyan', label: 'Cyan', light: '#096e85', dark: '#8bd3e6' },
  { id: 'indigo', label: 'Indigo', light: '#4f5bb4', dark: '#b1b8f3' },
  { id: 'coral', label: 'Coral', light: '#a24638', dark: '#efa996' },
  { id: 'copper', label: 'Copper', light: '#8a593d', dark: '#dbb49a' },
  { id: 'olive', label: 'Olive', light: '#596b24', dark: '#c0ce86' },
  { id: 'slate', label: 'Slate', light: '#526777', dark: '#b3c6d4' },
] as const;
export type Accent = (typeof accents)[number]['id'];
export function isAccent(value: unknown): value is Accent {
  return accents.some((a) => a.id === value);
}
