import * as crypto from 'crypto';
export const generateIncludeOptions = (model, visited = new Set()) => {
    if (visited.has(model))
        return []; // prevent circular recursion
    visited.add(model);
    const include = [];
    for (const associationName in model.associations) {
        const association = model.associations[associationName];
        if (!association || !association.target)
            continue;
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
export const hydrate = (model, data) => {
    if (!data)
        return null;
    const include = generateIncludeOptions(model);
    const buildInstance = (item) => model.build(item, {
        isNewRecord: false,
        include,
    });
    // findAndCountAll structure
    if (data.rows && typeof data.count === 'number') {
        return {
            rows: data.rows.map((r) => buildInstance(r)),
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
export const generateQueryKey = (modelName, options) => {
    const clonedOptions = JSON.parse(JSON.stringify(options || {}));
    delete clonedOptions.transaction;
    delete clonedOptions.logging;
    delete clonedOptions.benchmark;
    delete clonedOptions.replacements;
    const hash = crypto.createHash('md5').update(JSON.stringify(clonedOptions)).digest('hex');
    return [modelName, 'query', hash];
};
