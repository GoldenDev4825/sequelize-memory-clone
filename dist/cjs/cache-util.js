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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQueryKey = exports.hydrate = exports.generateIncludeOptions = void 0;
const crypto = __importStar(require("crypto"));
const generateIncludeOptions = (model, visited = new Set()) => {
    if (visited.has(model))
        return []; // prevent circular recursion
    visited.add(model);
    const include = [];
    for (const associationName in model.associations) {
        const association = model.associations[associationName];
        if (!association || !association.target)
            continue;
        const nestedInclude = (0, exports.generateIncludeOptions)(association.target, visited);
        include.push({
            association: associationName, // <-- use name, not full object
            required: false,
            include: nestedInclude.length ? nestedInclude : [],
        });
    }
    return include;
};
exports.generateIncludeOptions = generateIncludeOptions;
// Hydrates raw data into Sequelize model instances
const hydrate = (model, data) => {
    if (!data)
        return null;
    const include = (0, exports.generateIncludeOptions)(model);
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
exports.hydrate = hydrate;
/** Stable query key for cache */
const generateQueryKey = (modelName, options) => {
    const clonedOptions = JSON.parse(JSON.stringify(options || {}));
    delete clonedOptions.transaction;
    delete clonedOptions.logging;
    delete clonedOptions.benchmark;
    delete clonedOptions.replacements;
    const hash = crypto.createHash('md5').update(JSON.stringify(clonedOptions)).digest('hex');
    return [modelName, 'query', hash];
};
exports.generateQueryKey = generateQueryKey;
