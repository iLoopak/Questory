import type { CountBucket } from './types';

export function bucketCount(count: number): CountBucket {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 10) return '6-10';
  if (count <= 25) return '11-25';
  if (count <= 50) return '26-50';
  if (count <= 100) return '51-100';
  if (count <= 250) return '101-250';
  if (count <= 500) return '251-500';
  if (count <= 1000) return '501-1000';
  return '1000+';
}
