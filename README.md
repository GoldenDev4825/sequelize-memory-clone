# sequelize-memory-clone

[![npm version](https://img.shields.io/npm/v/sequelize-memory-clone)](https://www.npmjs.com/package/sequelize-memory-clone)
[![TypeScript](https://img.shields.io/badge/Written%20in-TypeScript-blue)](https://www.typescriptlang.org/)

An enhanced caching layer for Sequelize, transforming your Redis instance into a near real-time, in-memory clone of your database for frequently accessed data.

This package provides **deep, associative caching** for individual entities and **mass invalidation** for query results, ensuring consistency for high-scale read operations.

## ✨ Features
- **Entity Caching (Write-Through):** Caches individual model instances (`findByPk`, `create`) upon retrieval or modification.

- **Query Cache with Mass Invalidation:** Caches results from `findAll`, `findOne`, and `findAndCountAll`. Crucially, any write operation (`save`, `destroy`, `update`, `upsert`, `create`) on the model automatically invalidates ALL stored query caches for that model.

- **Deep Hydration:** Cached results are re-hydrated into fully functional Sequelize instances, preserving all associated models (including nested includes) as living Sequelize objects.

- **TypeScript Support:** Built entirely in TypeScript for strong typing and dual CJS/ESM compatibility.

- **ioredis Adapter Included:** Ships ready to use with the high-performance `ioredis` client.

## 🚀 Installation
This library requires `sequelize`, `ioredis`, and your choice of database driver.
```
# Install the core library
npm install sequelize-memory-clone sequelize ioredis
```

## 🛠️ Usage
**1. Setup (Adapter & Wrapper)**

First, initialize your Redis client and the `sequelize-memory-clone` wrapper.
```typescript
import { Sequelize, DataTypes } from 'sequelize';
import Redis from 'ioredis';
import { withCache, IORedisAdapter } from 'sequelize-memory-clone';

// 1. Initialize Redis Client
const redisClient = new Redis();
const redisAdapter = new IORedisAdapter({
  client: redisClient,
  namespace: 'app-cache',
  lifetime: 3600 // Cache TTL: 1 hour
});

// 2. Initialize the Cache Wrapper
const { withCache: cacheWrapper } = withCache(redisAdapter);

// 3. Setup Sequelize
const sequelize = new Sequelize('sqlite::memory:');

const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: DataTypes.STRING,
});

const Post = sequelize.define('Post', {
    title: DataTypes.STRING,
    userId: DataTypes.INTEGER
});
User.hasMany(Post, { foreignKey: 'userId', as: 'Posts' });

// 4. Wrap the Models to enable caching features
const CacheUser = cacheWrapper(User);
const CachePost = cacheWrapper(Post);

// Now use CacheUser and CachePost everywhere!
```

### 2. Cache Methods in Action

Access all caching features explicitly through the `.cache()` call.

| **Operation** | **Method** | **Behavior** | **Goal** | 
|---|---|---|---|
| **Get (Entity)** | `CacheUser.cache().findByPk(1)` | Checks cache first. If Miss, fetches from DB, caches result (Write-Through). | High-speed single entity lookups. | 
| **Get (Query)** | `CacheUser.cache('active_q').findAll(...)` | Checks cache first using the provided key. If Miss, fetches, caches result set, and tracks the query key. | Accelerate complex queries. | 
| **Write** | `userInstance.save()` | Writes to DB. Updates the individual entity cache (`User:1`). **Invalidates ALL tracked query caches for User.** | Ensures query results are fresh after writes. | 
| **Refresh** | `userInstance.cache().reload()` | Bypasses cache, fetches fresh data from DB, and updates the entity cache with the new data. | Corrects stale data after external database writes. | 

## 💻 Example Test Flow (What the Code Does)

The following sequence demonstrates the core functionality:

```
// --- TEST FLOW ---

// 1. Create: Writes to DB and populates entity cache. (Cache: [User:1] = { name: Alice })
const user = await CacheUser.create({ id: 1, name: 'Alice', status: 'active' }); 
await CachePost.create({ userId: 1, title: 'Post A' });

// 2. Query Miss/Set: Fills the query cache. (Cache: [query:active_q] = [User:1 with Posts])
await CacheUser.cache('active_list').findAll({ where: { status: 'active' }, include: 'Posts' });
// DB Query Executed.

// 3. External Write: Bypasses cache and updates DB only.
await User.update({ name: 'Alicia' }, { where: { id: user.id } });
// DB name is now 'Alicia', Cache name is still 'Alice'.

// 4. Stale Read: Gets old data from cache.
let staleUser = await CacheUser.cache().findByPk(user.id);
console.log(staleUser.name); // Output: Alice 

// 5. Force Reload: Bypasses cache, gets fresh data, and updates the entity cache.
await staleUser.cache().reload(); 
console.log(staleUser.name); // Output: Alicia 

// 6. Write Operation: Static Update
await CacheUser.cache().update({ name: 'ALICIA' }, { where: { id: user.id } });
// Cache Hook triggers: DEL [User:1], DEL [query:active_q], SET [User:1] (new data)

// 7. Query Re-check: Confirms invalidation.
await CacheUser.cache('active_list').findAll({ where: { status: 'active' }, include: 'Posts' });
// DB Query Executed (Cache Miss) - The mass invalidation worked!
```


## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page if you have any questions or would like to submit a Pull Request.

**Development Setup**

This package uses TypeScript and relies on `ioredis` as the default adapter.

**1. Clone the Repository:**

```
git clone git@github.com:YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
```
**2. Build Code:**

```
npm run build
```
This compiles the TypeScript (`src/`) into CJS and ESM formats in the `dist/` directory.

**3. Local Testing:** Use `npm link` to test your changes in a local application environment:
```
# In the library directory
npm link

# In your separate test project directory
npm link sequelize-memory-clone
```
**Adapter Development**

The core interface is simple, allowing for easy adaptation to other cache systems:
```
export interface CacheAdapter {
  get(key: string[]): Promise<any | null>;
  set(key: string[], value: any, options?: { lifetime?: number }): Promise<void>;
  del(key: string[]): Promise<void>;
  // Crucial methods for mass invalidation:
  delModelQueries(modelName: string): Promise<void>;
  addQueryKey(modelName: string, queryKey: string[]): Promise<void>;
}
```