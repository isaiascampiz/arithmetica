export const accents = [
  { id: 'teal', label: 'Teal', light: '#247872', dark: '#84cdc1' },
  { id: 'blue', label: 'Blue', light: '#315ea8', dark: '#9cbcff' },
  { id: 'violet', label: 'Violet', light: '#7150a0', dark: '#c8acf0' },
  { id: 'amber', label: 'Amber', light: '#8a5a14', dark: '#e7c183' },
  { id: 'rose', label: 'Rose', light: '#a14e69', dark: '#eab0bd' },
] as const;
export type Accent = (typeof accents)[number]['id'];
export function isAccent(value: unknown): value is Accent {
  return accents.some((a) => a.id === value);
}
