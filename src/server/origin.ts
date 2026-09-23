/** Compare browser Origin against the incoming authority, not Next's internal bind hostname. */
export function isSameOrigin(origin: string | null, host: string | null, protocol: string): boolean {
  if (!origin || !host || !['http:', 'https:'].includes(protocol)) return false;
  try {
    const source = new URL(origin);
    const destination = new URL(`${protocol}//${host}`);
    return source.origin === origin && source.origin === destination.origin;
  } catch {
    return false;
  }
}
