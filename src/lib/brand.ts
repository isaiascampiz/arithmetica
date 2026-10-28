export const APP_NAME = 'Arithmetica';
export const APP_VERSION = '3.0.0';
export const CENTER_NAME = 'Kumon Learning Center · Yuba City';
/** Display alias only. Historical reports and saved records are never rewritten. */
export function centerName(name: string) {
  return name === 'Willow Learning Center' ? CENTER_NAME : name;
}
