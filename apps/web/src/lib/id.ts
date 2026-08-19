/** Stable id generator that works in browsers without crypto.randomUUID. */
export function createId(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && 'randomUUID' in globalCrypto) {
    return globalCrypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
