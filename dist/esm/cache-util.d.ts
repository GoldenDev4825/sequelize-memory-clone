import { Model, ModelStatic, FindOptions, Includeable } from 'sequelize';
export declare const generateIncludeOptions: (model: ModelStatic<any>, visited?: Set<ModelStatic<any>>) => Includeable[];
export declare const hydrate: <T extends Model>(model: ModelStatic<T>, data: any) => T | T[] | {
    rows: T[];
    count: number;
} | null;
/** Stable query key for cache */
export declare const generateQueryKey: (modelName: string, options: FindOptions) => string[];
