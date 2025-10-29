import { CacheAdapter, IORedisAdapterOptions } from './types';
export declare class IORedisAdapter implements CacheAdapter {
    private client;
    private namespace;
    private lifetime;
    private querySetPrefix;
    constructor(options: IORedisAdapterOptions);
    private getKey;
    private getQuerySetKey;
    get(keyParts: string[]): Promise<any | null>;
    set(keyParts: string[], value: any, options?: {
        lifetime?: number;
    }): Promise<void>;
    del(keyParts: string[]): Promise<void>;
    /**
     * Tracks a new query key in the set of all query keys for a model.
     * This is called on a cache SET operation for query results (e.g., findAll).
     */
    addQueryKey(modelName: string, queryKeyParts: string[]): Promise<void>;
    /**
     * Clears ALL query caches for a specific model by deleting all keys
     * tracked in the model's query set.
     * This is called on all WRITE operations (create, update, destroy).
     */
    delModelQueries(modelName: string): Promise<void>;
}
