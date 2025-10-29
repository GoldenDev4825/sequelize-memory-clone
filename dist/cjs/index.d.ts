import { WithCache } from './types';
/**
 * Main factory function to initialize the cache layer.
 * Accepts an IORedis client or a custom adapter.
 */
export declare const withCache: WithCache;
export { IORedisAdapter } from './ioredis-adapter';
export * from './types';
