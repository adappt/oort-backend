import mongoose from 'mongoose';

const DEFAULT_FIELDS = [
    {
        name: 'id',
        type: 'text'
    },
    {
        name: 'createdAt',
        type: 'date'
    },
    {
        name: 'modifiedAt',
        type: 'date'
    }
];

const FLAT_DEFAULT_FIELDS = ['id', 'createdAt', 'modifiedAt'];

const MULTISELECT_TYPES: string[] = ['checkbox', 'tagbox', 'owner'];

/**
 * Transforms query filter into mongo filter.
 * @param filter filter to transform to mongo filter.
 * @returns Mongo filter.
 */
const buildMongoFilter = (filter: any, fields: any[]): any => {
    if (filter.filters) {
        const filters = filter.filters.map((x: any) => buildMongoFilter(x, fields));
        if (filters.length > 0) {
            switch (filter.logic) {
                case 'and': {
                    return { $and: filters };
                }
                case 'or': {
                    return { $or: filters };
                }
                default: {
                    return;
                }
            }
        } else {
            return;
        }
    } else {
        if (filter.field) {
            if (filter.field === 'ids') {
                return { _id: { $in: filter.value.map(x => mongoose.Types.ObjectId(x)) } };
            }
            if (filter.operator) {
                const fieldName = FLAT_DEFAULT_FIELDS.includes(filter.field) ? filter.field : `data.${filter.field}`;
                const field = fields.find(x => x.name === filter.field);
                let value = filter.value
                switch (field.type) {
                    case 'date':
                        value = new Date(value);
                        break;
                    case 'datetime':
                        value = new Date(value);
                        break;
                    case 'datetime-local':
                        value = new Date(value);
                        break;
                    case 'time': {
                        const hours = value.slice(0, 2);
                        const minutes = value.slice(3);
                        console.log(hours);
                        value = new Date(Date.UTC(1970, 0, 1, hours, minutes));
                        break;
                    }
                    default:
                        break;
                }
                switch (filter.operator) {
                    case 'eq': {
                        if (MULTISELECT_TYPES.includes(field.type)) {
                            return { [fieldName]: { $size: value.length, $all: value } };
                        } else {
                            return { [fieldName]: { $eq: value } };
                        }
                    }
                    case 'neq': {
                        if (MULTISELECT_TYPES.includes(field.type)) {
                            return { [fieldName]: { $not: { $size: value.length, $all: value } } };
                        } else {
                            return { [fieldName]: { $ne: value } };
                        }
                    }
                    case 'isnull': {
                        return { $or: [{ [fieldName]: { $exists: false } }, { [fieldName]: { $eq: null } }] }
                    }
                    case 'isnotnull': {
                        return { [fieldName]: { $exists: true, $ne: null } };
                    }
                    case 'lt': {
                        return { [fieldName]: { $lt: value } };
                    }
                    case 'lte': {
                        return { [fieldName]: { $lte: value } };
                    }
                    case 'gt': {
                        return { [fieldName]: { $gt: value } };
                    }
                    case 'gte': {
                        return { [fieldName]: { $gte: value } };
                    }
                    case 'startswith': {
                        return { [fieldName]: { $regex: '^' + value, $options: 'i' } };
                    }
                    case 'endswith': {
                        return { [fieldName]: { $regex: value + '$', $options: 'i' } };
                    }
                    case 'contains': {
                        if (MULTISELECT_TYPES.includes(field.type)) {
                            return { [fieldName]: { $all: value } };
                        } else {
                            return { [fieldName]: { $regex: value, $options: 'i' } };
                        }
                    }
                    case 'doesnotcontain': {
                        if (MULTISELECT_TYPES.includes(field.type)) {
                            return { [fieldName]: { $not: { $in: value } } };
                        } else {
                            return { [fieldName]: { $not: { $regex: value, $options: 'i' } } };
                        }
                    }
                    case 'isempty': {
                        if (MULTISELECT_TYPES.includes(field.type)) {
                            return { $or: [{ [fieldName]: { $exists: true, $size: 0 } }, { [fieldName]: { $exists: false } }, { [fieldName]: { $eq: null } }] };
                        } else {
                            return { [fieldName]: { $exists: true, $eq: '' } };
                        }
                    }
                    case 'isnotempty': {
                        if (MULTISELECT_TYPES.includes(field.type)) {
                            return { [fieldName]: { $exists: true, $ne: [] } };
                        } else {
                            return { [fieldName]: { $exists: true, $ne: '' } };
                        }
                    }
                    default: {
                        return;
                    }
                }
            } else {
                return;
            }
        }
    }
}

export default (filter: any, fields: any[]) => {
    const expandedFields = fields.concat(DEFAULT_FIELDS);
    const mongooseFilter = buildMongoFilter(filter, expandedFields) || {};
    console.log(JSON.stringify(mongooseFilter));
    return mongooseFilter;
}
