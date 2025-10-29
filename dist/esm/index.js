import { IORedisAdapter } from './ioredis-adapter';
import { applyCacheMethods } from './cache-methods';
/**
 * Main factory function to initialize the cache layer.
 * Accepts an IORedis client or a custom adapter.
 */
export const withCache = (clientOrAdapter) => {
    let adapter;
    if (clientOrAdapter instanceof IORedisAdapter) {
        adapter = clientOrAdapter;
    }
    else {
        // Initialize the IORedisAdapter from options
        adapter = new IORedisAdapter(clientOrAdapter);
    }
    // This function is called for every Model you want to enable caching on
    const withCacheFn = (model) => {
        const modelStatic = model;
        const modelName = modelStatic.name;
        const primaryKeyAttribute = modelStatic.primaryKeyAttribute;
        // --- Model Class Wrapper (Model.cache().findAll()) ---
        modelStatic.cache = function (customKey) {
            return applyCacheMethods(adapter, modelStatic, customKey);
        };
        // --- Instance Wrapper Hooks ---
        // Overriding the instance save() method for write-through/invalidation
        const originalSave = modelStatic.prototype.save;
        modelStatic.prototype.save = async function (options) {
            const instance = await originalSave.call(this, options);
            // After save, update the single entity cache and invalidate queries
            const primaryKey = instance.get(primaryKeyAttribute);
            // 1. Update the single entity cache (write-through)
            await adapter.set([modelName, primaryKey], instance.get({ plain: true }));
            // 2. Invalidate ALL query caches for this model
            await adapter.delModelQueries(modelName);
            return instance;
        };
        // Overriding the instance reload() method for cache update (Write-through)
        const originalReload = modelStatic.prototype.reload; // <--- ADDED PROTOTYPE OVERRIDE
        modelStatic.prototype.reload = async function (options) {
            const instance = await originalReload.call(this, options);
            const primaryKey = instance.get(primaryKeyAttribute);
            await adapter.set([modelName, primaryKey], instance.get({ plain: true }));
            return instance;
        };
        // Overriding the instance destroy() method for cache invalidation
        const originalDestroy = modelStatic.prototype.destroy;
        modelStatic.prototype.destroy = async function (options) {
            const instance = this;
            const primaryKey = instance.get(primaryKeyAttribute);
            // 1. Execute DB destroy
            await originalDestroy.call(this, options);
            // 2. Delete the single entity cache
            await adapter.del([modelName, primaryKey]);
            // 3. Invalidate ALL query caches for this model
            await adapter.delModelQueries(modelName);
            // Return nothing as original destroy does
        };
        modelStatic.prototype.cache = function () {
            const instancePrimaryKey = this.get(primaryKeyAttribute);
            return applyCacheMethods(adapter, modelStatic, instancePrimaryKey, this);
        };
        return modelStatic;
    };
    return { withCache: withCacheFn };
};
export { IORedisAdapter } from './ioredis-adapter';
export * from './types';
