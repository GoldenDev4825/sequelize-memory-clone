import { Model, ModelStatic, FindOptions, Includeable } from 'sequelize';
import * as crypto from 'crypto';

export const generateIncludeOptions = (
  model: ModelStatic<any>,
  visited = new Set<ModelStatic<any>>()
): Includeable[] => {
  if (visited.has(model)) return []; // prevent circular recursion
  visited.add(model);

  const include: Includeable[] = [];

  for (const associationName in model.associations) {
    const association = model.associations[associationName];
    if (!association || !association.target) continue;

    const nestedInclude = generateIncludeOptions(association.target, visited);

    include.push({
      association: associationName, // <-- use name, not full object
      required: false,
      include: nestedInclude.length ? nestedInclude : [],
    });
  }

  return include;
};

// Hydrates raw data into Sequelize model instances
export const hydrate = <T extends Model>(
  model: ModelStatic<T>,
  data: any,
): T | T[] | { rows: T[]; count: number } | null => {
  if (!data) return null;

  const include = generateIncludeOptions(model);

  const buildInstance = (item: any): T =>
    model.build(item, {
      isNewRecord: false,
      include,
    }) as T;

  // findAndCountAll structure
  if (data.rows && typeof data.count === 'number') {
    return {
      rows: data.rows.map((r: any) => buildInstance(r)),
      count: data.count,
    };
  }

  // findAll or findOne structure
  if (Array.isArray(data)) {
    return data.map(r => buildInstance(r));
  }

  // Single record
  if (typeof data === 'object') {
    return buildInstance(data);
  }

  return null;
};

/** Stable query key for cache */
export const generateQueryKey = (modelName: string, options: FindOptions): string[] => {
  const clonedOptions = JSON.parse(JSON.stringify(options || {}));
  delete (clonedOptions as any).transaction;
  delete (clonedOptions as any).logging;
  delete (clonedOptions as any).benchmark;
  delete (clonedOptions as any).replacements;

  const hash = crypto.createHash('md5').update(JSON.stringify(clonedOptions)).digest('hex');
  return [modelName, 'query', hash];
};
