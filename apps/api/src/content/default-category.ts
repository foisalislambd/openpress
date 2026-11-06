/** Posts with no category pick up the Writing setting, the same way WordPress assigns the default category. */
export function categoryIdsForPost(
  type: string,
  explicit: string[] | undefined,
  defaultId: unknown,
): string[] | undefined {
  if (type !== 'POST') return explicit;
  if (explicit && explicit.length > 0) return explicit;
  if (typeof defaultId === 'string' && defaultId.trim()) return [defaultId.trim()];
  return explicit;
}
