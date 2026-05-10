const TRUTHY = new Set(['true', '1', 'yes', 'on']);

export function parseBoolFlag(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  return TRUTHY.has(String(raw).trim().toLowerCase());
}
