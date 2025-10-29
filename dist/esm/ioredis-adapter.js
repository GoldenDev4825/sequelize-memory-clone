export class IORedisAdapter {
    constructor(options) {
        this.client = options.client;
        this.namespace = options.namespace || 'sequelize-cache';
        this.lifetime = options.lifetime || 3600; // 1 hour default
        this.querySetPrefix = `${this.namespace}:queries:`; // Key prefix for query sets
    }
    getKey(keyParts) {
        return `${this.namespace}:${keyParts.join(':')}`;
    }
    getQuerySetKey(modelName) {
        return `${this.querySetPrefix}${modelName}`;
    }
    async get(keyParts) {
        const key = this.getKey(keyParts);
        const result = await this.client.get(key);
        if (!result)
            return null;
        try {
            return JSON.parse(result);
        }
        catch (e) {
            console.error('Failed to parse cached JSON for key:', key, e);
            return null;
        }
    }
    async set(keyParts, value, options) {
        const key = this.getKey(keyParts);
        const ttl = options?.lifetime || this.lifetime;
        const serializedValue = JSON.stringify(value);
        await this.client.set(key, serializedValue, 'EX', ttl);
    }
    async del(keyParts) {
        const key = this.getKey(keyParts);
        await this.client.del(key);
    }
    /**
     * Tracks a new query key in the set of all query keys for a model.
     * This is called on a cache SET operation for query results (e.g., findAll).
     */
    async addQueryKey(modelName, queryKeyParts) {
        const modelQuerySetKey = this.getQuerySetKey(modelName);
        const queryKey = this.getKey(queryKeyParts);
        // SADD adds the query key string to the set
        await this.client.sadd(modelQuerySetKey, queryKey);
    }
    /**
     * Clears ALL query caches for a specific model by deleting all keys
     * tracked in the model's query set.
     * This is called on all WRITE operations (create, update, destroy).
     */
    async delModelQueries(modelName) {
        const modelQuerySetKey = this.getQuerySetKey(modelName);
        const queryKeys = await this.client.smembers(modelQuerySetKey);
        if (queryKeys.length > 0) {
            const keysToDelete = [...queryKeys, modelQuerySetKey];
            await this.client.del(...keysToDelete);
        }
        else {
            await this.client.del(modelQuerySetKey);
        }
    }
}
