import { createHash } from 'crypto';

export function normalizeHashInput(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashRequestPart(value: string): string {
  return createHash('sha256').update(normalizeHashInput(value)).digest('hex').slice(0, 32);
}

export function shortRequestKey(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
