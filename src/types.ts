import { Model, FindOptions, Optional, ModelStatic, WhereOptions, BulkCreateOptions } from 'sequelize';
import * as Redis from 'ioredis';
import { IORedisAdapter } from './ioredis-adapter';

// --- Interfaces for Abstraction ---
export interface CacheAdapter {
  get(key: string[]): Promise<any | null>;
  set(key: string[], value: any, options?: { lifetime?: number }): Promise<void>;
  del(key: string[]): Promise<void>;
  delModelQueries(modelName: string): Promise<void>;
  addQueryKey(modelName: string, queryKey: string[]): Promise<void>;
}

export interface IORedisAdapterOptions {
  client: Redis.Redis;
  namespace?: string;
  lifetime?: number; // TTL in seconds
}

// --- Interfaces for Sequelize Augmentation ---

// The methods returned by Model.cache()
export interface CacheMethods<T extends Model> {
  // Read operations (Query Caching & Entity Fetch)
  findByPk(identifier: number | string, options?: FindOptions): Promise<T | null>;
  findOne(options?: FindOptions): Promise<T | null>;
  findAll(options?: FindOptions): Promise<T[]>;
  findAndCountAll(options?: FindOptions): Promise<{ rows: T[]; count: number }>;
  
  // Write operations (Write-through Caching & Invalidation)
  create<V extends Optional<any, string>>(values?: V, options?: any): Promise<T>;
  bulkCreate(records: Array<T['_creationAttributes']>, options?: BulkCreateOptions): Promise<T[]>;
  update(values: object, options: { where: WhereOptions }): Promise<[number, T[]]>;
  upsert(values?: object, options?: any): Promise<[T, boolean | null]>;

  // Instance methods proxied via cache()
  reload(options?: FindOptions): Promise<T>;
  
  // Cache Management
  clear(customKey?: string): Promise<void>;
  clearAllModelQueries(): Promise<void>;
  
  // Access
  client(): CacheAdapter;
}

// Custom Model class with the cache() method
export interface CacheModelStatic<T extends Model> extends ModelStatic<T> {
  cache(customKey?: string): CacheMethods<T>;
}

// Instance-level augmentation — use an intersection type (not `extends T`)
export type CacheInstance<T extends Model = Model> = T & {
  cache(): CacheMethods<T>;
  destroy(options?: any): Promise<void>;
  save(options?: any): Promise<T>;
};

export type WithCache = (client: IORedisAdapter | IORedisAdapterOptions) => {
  withCache: <T extends Model>(model: T) => T & CacheModelStatic<T>;
};