import { Model, ModelStatic, FindOptions, Utils, BulkCreateOptions, WhereOptions } from 'sequelize';
import { CacheMethods, CacheAdapter, CacheInstance } from './types';
import { generateQueryKey, hydrate } from './cache-util';

export const applyCacheMethods = <T extends Model>(
  client: CacheAdapter,
  model: ModelStatic<T>,
  customKey?: string,
  instance?: T
): CacheMethods<T> => {
  const modelName = model.name;
  const primaryKeyAttribute = model.primaryKeyAttribute as string; // ensure string for .get()

  const methods: CacheMethods<T> = {
    client: () => client,

    // --- CACHE MANAGEMENT ---
    async clear(key?: string) {
      const keyParts = key ? [modelName, 'query', key] : [modelName, 'query', customKey];
      if (keyParts.some(p => p === undefined)) {
        console.warn(`Cannot clear cache: Key parts for ${modelName} missing. Did you forget a customKey?`);
        return;
      }
      await client.del(keyParts as string[]);
    },

    async clearAllModelQueries() {
      await client.delModelQueries(modelName);
    },

    // --- READ METHODS ---
    async findByPk(identifier: number | string, options: FindOptions = {}): Promise<T | null> {
      const entityKey = [modelName, identifier.toString()];
      const cachedData = await client.get(entityKey);

      if (cachedData) {
        const hydrated = hydrate(model, cachedData);
        // hydrate may return T | T[] | {rows, count} | null
        if (Array.isArray(hydrated)) return (hydrated[0] ?? null) as T | null;
        return (hydrated as T | null);
      }

      const instance = await model.findByPk(identifier, options);
      if (instance) {
        const plainData = instance.get({ plain: true });
        await client.set(entityKey, plainData);
      }
      return instance;
    },

    async findAll(options: FindOptions = {}): Promise<T[]> {
      const queryKeyParts = customKey ? [modelName, 'query', customKey] : generateQueryKey(modelName, options);
      const cachedData = await client.get(queryKeyParts);

      if (cachedData) {
        const hydrated = hydrate(model, cachedData);
        if (Array.isArray(hydrated)) return hydrated as T[];
        // If hydrate produced { rows, count } return rows
        if (hydrated && typeof hydrated === 'object' && 'rows' in hydrated) {
          return (hydrated as any).rows as T[];
        }
        return [];
      }

      const results = await model.findAll(options);
      const plainData = results.map(i => i.get({ plain: true }));
      await client.set(queryKeyParts, plainData);
      await client.addQueryKey(modelName, queryKeyParts);

      return results;
    },

    async findOne(options: FindOptions = {}): Promise<T | null> {
      const queryKeyParts = customKey ? [modelName, 'query', customKey] : generateQueryKey(modelName, options);
      const cachedData = await client.get(queryKeyParts);

      if (cachedData) {
        const hydrated = hydrate(model, cachedData);
        if (Array.isArray(hydrated)) return (hydrated[0] ?? null) as T | null;
        return (hydrated as T | null);
      }

      const result = await model.findOne(options);
      if (result) {
        await client.set(queryKeyParts, result.get({ plain: true }));
        await client.addQueryKey(modelName, queryKeyParts);
      }

      return result;
    },

    async findAndCountAll(options: FindOptions = {}): Promise<{ rows: T[]; count: number }> {
      const queryKeyParts = customKey
        ? [modelName, 'query', customKey]
        : generateQueryKey(modelName, options);
    
      const cachedData = await client.get(queryKeyParts);
    
      if (cachedData) {
        const hydrated = hydrate(model, cachedData);
        if (hydrated && typeof hydrated === 'object') {
          if ('rows' in hydrated && Array.isArray(hydrated.rows)) {
            // Return hydrated rows as model instances
            return hydrated as { rows: T[]; count: number };
          }
          if (Array.isArray(hydrated)) {
            return { rows: hydrated as T[], count: hydrated.length };
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
    async create(values?: Partial<T['_creationAttributes']>, options?: any): Promise<T> {
      const instance = await (model as ModelStatic<T>).create(values as any, options);
    
      if (!instance) throw new Error(`Failed to create instance for model ${modelName}`);
    
      const primaryKey = instance.get(primaryKeyAttribute) as string;
      await Promise.all([
        client.set([modelName, primaryKey], instance.get({ plain: true })),
        client.delModelQueries(modelName)
      ]);
    
      return instance;
    },

    async bulkCreate(records: Array<T['_creationAttributes']>, options?: BulkCreateOptions): Promise<T[]> {
      const instances = await model.bulkCreate(records as any, options);
      await client.delModelQueries(modelName);
      return instances;
    },

    async update(values: object, options: { where: WhereOptions }): Promise<[number, T[]]> {
      // model.update returns [affectedCount, affectedRows]
      const [rowCount, affectedRows] = (await model.update(values as any, options as any)) as [number, T[]];

      if (rowCount > 0 && options.where) {
        const updatedInstances = await model.findAll({ where: options.where });
        for (const instance of updatedInstances) {
          const pk = instance.get(primaryKeyAttribute) as unknown as string;
          await client.set([modelName, pk], instance.get({ plain: true }));
        }
      }

      await client.delModelQueries(modelName);
      // Return what Sequelize expects — affectedRows may be empty depending on config.
      return [rowCount, affectedRows ?? []];
    },

    async upsert(values?: Partial<T['_creationAttributes']>, options?: any): Promise<[T, boolean | null]> {
      // model.upsert sometimes returns [instance, createdFlag] — cast to expected tuple
      const upsertResult = (await model.upsert(values as any, options as any)) as unknown;
      // Normalize result
      let instance: T;
      let created: boolean | null = null;
      if (Array.isArray(upsertResult) && upsertResult.length >= 1) {
        instance = upsertResult[0] as T;
        created = (upsertResult[1] ?? null) as boolean | null;
      } else {
        // Some dialects may return boolean only; fall back to a best-effort
        instance = (upsertResult as any) as T;
      }

      const primaryKey = instance.get(primaryKeyAttribute) as unknown as string;
      await client.set([modelName, primaryKey], instance.get({ plain: true }));
      await client.delModelQueries(modelName);

      return [instance, created];
    },

    // --- INSTANCE METHOD PROXIES (Called via instance.cache().method()) ---
    
    async reload(options?: FindOptions): Promise<T> {
      if (!instance) {
        throw new Error("Reload must be called on a specific instance (e.g., myInstance.cache().reload()).");
      }
      
      return (instance as CacheInstance<T>).reload(options); 
    },
  };

  return methods;
};