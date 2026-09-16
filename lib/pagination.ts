export const PAGE_SIZE = 50;
export function parsePage(value: string | undefined): number {
  const page = Number(value ?? 1);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
}
