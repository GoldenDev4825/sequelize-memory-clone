import { Model, ModelStatic } from 'sequelize';
import { CacheMethods, CacheAdapter } from './types';
export declare const applyCacheMethods: <T extends Model>(client: CacheAdapter, model: ModelStatic<T>, customKey?: string, instance?: T) => CacheMethods<T>;
