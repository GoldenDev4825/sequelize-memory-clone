"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCacheMethods = void 0;
const cache_util_1 = require("./cache-util");
const applyCacheMethods = (client, model, customKey, instance) => {
    const modelName = model.name;
    const primaryKeyAttribute = model.primaryKeyAttribute; // ensure string for .get()
    const methods = {
        client: () => client,
        // --- CACHE MANAGEMENT ---
        async clear(key) {
            const keyParts = key ? [modelName, 'query', key] : [modelName, 'query', customKey];
            if (keyParts.some(p => p === undefined)) {
                console.warn(`Cannot clear cache: Key parts for ${modelName} missing. Did you forget a customKey?`);
                return;
            }
            await client.del(keyParts);
        },
        async clearAllModelQueries() {
            await client.delModelQueries(modelName);
        },
        // --- READ METHODS ---
        async findByPk(identifier, options = {}) {
            const entityKey = [modelName, identifier.toString()];
            const cachedData = await client.get(entityKey);
            if (cachedData) {
                const hydrated = (0, cache_util_1.hydrate)(model, cachedData);
                // hydrate may return T | T[] | {rows, count} | null
                if (Array.isArray(hydrated))
                    return (hydrated[0] ?? null);
                return hydrated;
            }
            const instance = await model.findByPk(identifier, options);
            if (instance) {
                const plainData = instance.get({ plain: true });
                await client.set(entityKey, plainData);
            }
            return instance;
        },
        async findAll(options = {}) {
            const queryKeyParts = customKey ? [modelName, 'query', customKey] : (0, cache_util_1.generateQueryKey)(modelName, options);
            const cachedData = await client.get(queryKeyParts);
            if (cachedData) {
                const hydrated = (0, cache_util_1.hydrate)(model, cachedData);
                if (Array.isArray(hydrated))
                    return hydrated;
                // If hydrate produced { rows, count } return rows
                if (hydrated && typeof hydrated === 'object' && 'rows' in hydrated) {
                    return hydrated.rows;
                }
                return [];
            }
            const results = await model.findAll(options);
            const plainData = results.map(i => i.get({ plain: true }));
            await client.set(queryKeyParts, plainData);
            await client.addQueryKey(modelName, queryKeyParts);
            return results;
        },
        async findOne(options = {}) {
            const queryKeyParts = customKey ? [modelName, 'query', customKey] : (0, cache_util_1.generateQueryKey)(modelName, options);
            const cachedData = await client.get(queryKeyParts);
            if (cachedData) {
                const hydrated = (0, cache_util_1.hydrate)(model, cachedData);
                if (Array.isArray(hydrated))
                    return (hydrated[0] ?? null);
                return hydrated;
            }
            const result = await model.findOne(options);
            if (result) {
                await client.set(queryKeyParts, result.get({ plain: true }));
                await client.addQueryKey(modelName, queryKeyParts);
            }
            return result;
        },
        async findAndCountAll(options = {}) {
            const queryKeyParts = customKey
                ? [modelName, 'query', customKey]
                : (0, cache_util_1.generateQueryKey)(modelName, options);
            const cachedData = await client.get(queryKeyParts);
            if (cachedData) {
                const hydrated = (0, cache_util_1.hydrate)(model, cachedData);
                if (hydrated && typeof hydrated === 'object') {
                    if ('rows' in hydrated && Array.isArray(hydrated.rows)) {
                        // Return hydrated rows as model instances
                        return hydrated;
                    }
                    if (Array.isArray(hydrated)) {
                        return { rows: hydrated, count: hydrated.length };
                    }
                }
                return { rows: [], count: 0 };
            }
            const results = await model.findAndCountAll(options);
            const plainData = {
                rows: results.rows.map(r => r.get({ plain: true })),
                count: results.count,
            };
            await client.set(queryKeyParts, plainData);
            await client.addQueryKey(modelName, queryKeyParts);
            return results;
        },
        // --- WRITE METHODS ---
        // Use the model's _creationAttributes type for the create/upsert signatures.
        async create(values, options) {
            const instance = await model.create(values, options);
            if (!instance)
                throw new Error(`Failed to create instance for model ${modelName}`);
            const primaryKey = instance.get(primaryKeyAttribute);
            await Promise.all([
                client.set([modelName, primaryKey], instance.get({ plain: true })),
                client.delModelQueries(modelName)
            ]);
            return instance;
        },
        async bulkCreate(records, options) {
            const instances = await model.bulkCreate(records, options);
            await client.delModelQueries(modelName);
            return instances;
        },
        async update(values, options) {
            // model.update returns [affectedCount, affectedRows]
            const [rowCount, affectedRows] = (await model.update(values, options));
            if (rowCount > 0 && options.where) {
                const updatedInstances = await model.findAll({ where: options.where });
                for (const instance of updatedInstances) {
                    const pk = instance.get(primaryKeyAttribute);
                    await client.set([modelName, pk], instance.get({ plain: true }));
                }
            }
            await client.delModelQueries(modelName);
            // Return what Sequelize expects — affectedRows may be empty depending on config.
            return [rowCount, affectedRows ?? []];
        },
        async upsert(values, options) {
            // model.upsert sometimes returns [instance, createdFlag] — cast to expected tuple
            const upsertResult = (await model.upsert(values, options));
            // Normalize result
            let instance;
            let created = null;
            if (Array.isArray(upsertResult) && upsertResult.length >= 1) {
                instance = upsertResult[0];
                created = (upsertResult[1] ?? null);
            }
            else {
                // Some dialects may return boolean only; fall back to a best-effort
                instance = upsertResult;
            }
            const primaryKey = instance.get(primaryKeyAttribute);
            await client.set([modelName, primaryKey], instance.get({ plain: true }));
            await client.delModelQueries(modelName);
            return [instance, created];
        },
        // --- INSTANCE METHOD PROXIES (Called via instance.cache().method()) ---
        async reload(options) {
            if (!instance) {
                throw new Error("Reload must be called on a specific instance (e.g., myInstance.cache().reload()).");
            }
            return instance.reload(options);
        },
    };
    return methods;
};
exports.applyCacheMethods = applyCacheMethods;
