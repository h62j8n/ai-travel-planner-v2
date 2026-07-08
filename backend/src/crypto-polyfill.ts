/**
 * @nestjs/typeorm (v11) internally calls the global `crypto.randomUUID()`.
 * That global is only available without a flag starting Node.js 18.17/20.5+.
 * This polyfill keeps local dev working on slightly older Node 18.x runtimes
 * without forcing a system-wide Node upgrade. Must be imported before any
 * module that touches TypeORM (imported first in main.ts).
 */
import { webcrypto } from 'node:crypto';

if (typeof (globalThis as { crypto?: unknown }).crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}
