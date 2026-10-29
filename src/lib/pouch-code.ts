/** New Arithmetica labels and previously printed Centerflow labels both remain valid. */
export const isPouchCode = (value: string) => /^(?:AR|CF)-[A-Za-z0-9-]+$/.test(value);
export const isPouchCodePrefix = (value: string) => /^(?:AR|CF)-/.test(value);
