import path from 'node:path';
export const dataDir = process.env.VAULTMUSIC_DATA || path.join(import.meta.dirname, 'data');
