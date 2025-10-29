"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IORedisAdapter = exports.withCache = void 0;
const ioredis_adapter_1 = require("./ioredis-adapter");
const cache_methods_1 = require("./cache-methods");
/**
 * Main factory function to initialize the cache layer.
 * Accepts an IORedis client or a custom adapter.
 */
const withCache = (clientOrAdapter) => {
    let adapter;
    if (clientOrAdapter instanceof ioredis_adapter_1.IORedisAdapter) {
        adapter = clientOrAdapter;
    }
    else {
        // Initialize the IORedisAdapter from options
        adapter = new ioredis_adapter_1.IORedisAdapter(clientOrAdapter);
    }
    // This function is called for every Model you want to enable caching on
    const withCacheFn = (model) => {
        const modelStatic = model;
        const modelName = modelStatic.name;
        const primaryKeyAttribute = modelStatic.primaryKeyAttribute;
        // --- Model Class Wrapper (Model.cache().findAll()) ---
        modelStatic.cache = function (customKey) {
            return (0, cache_methods_1.applyCacheMethods)(adapter, modelStatic, customKey);
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
            return (0, cache_methods_1.applyCacheMethods)(adapter, modelStatic, instancePrimaryKey, this);
        };
        return modelStatic;
    };
    return { withCache: withCacheFn };
};
exports.withCache = withCache;
var ioredis_adapter_2 = require("./ioredis-adapter");
Object.defineProperty(exports, "IORedisAdapter", { enumerable: true, get: function () { return ioredis_adapter_2.IORedisAdapter; } });
__exportStar(require("./types"), exports);
