import {
  GraphQLBoolean,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { AccessType, FormType, RecordConnectionType, LayoutType } from '.';
import { Form, Record } from '../../models';
import { AppAbility } from '../../security/defineUserAbility';
import extendAbilityForRecords from '../../security/extendAbilityForRecords';
import { Connection, decodeCursor, encodeCursor } from './pagination';
import getFilter from '../../utils/schema/resolvers/Query/getFilter';
import { pluralize } from 'inflection';
import { getAccessibleFields } from '../../utils/form';

/** GraphQL Resource type definition */
export const ResourceType = new GraphQLObjectType({
  name: 'Resource',
  fields: () => ({
    id: { type: GraphQLID },
    name: { type: GraphQLString },
    queryName: {
      type: GraphQLString,
      resolve(parent) {
        return 'all' + pluralize(Form.getGraphQLTypeName(parent.name));
      },
    },
    createdAt: { type: GraphQLString },
    permissions: {
      type: AccessType,
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return ability.can('update', parent) ? parent.permissions : null;
      },
    },
    forms: {
      type: new GraphQLList(FormType),
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return Form.find({ resource: parent.id }).accessibleBy(ability, 'read');
      },
    },
    relatedForms: {
      type: new GraphQLList(FormType),
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return Form.find({
          status: 'active',
          'fields.resource': parent.id,
        }).accessibleBy(ability, 'read');
      },
    },
    coreForm: {
      type: FormType,
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return Form.findOne({ resource: parent.id, core: true }).accessibleBy(
          ability,
          'read'
        );
      },
    },
    records: {
      type: RecordConnectionType,
      args: {
        first: { type: GraphQLInt },
        afterCursor: { type: GraphQLID },
        filter: { type: GraphQLJSON },
        archived: { type: GraphQLBoolean },
      },
      async resolve(parent, args, context) {
        let mongooseFilter: any = {
          resource: parent.id,
        };
        if (args.archived) {
          Object.assign(mongooseFilter, { archived: true });
        } else {
          Object.assign(mongooseFilter, { archived: { $ne: true } });
        }
        if (args.filter) {
          mongooseFilter = {
            ...mongooseFilter,
            ...getFilter(args.filter, parent.fields),
          };
        }
        // PAGINATION
        const cursorFilters = args.afterCursor
          ? {
              _id: {
                $gt: decodeCursor(args.afterCursor),
              },
            }
          : {};
        // Check abilities
        const ability = await extendAbilityForRecords(context.user, parent);
        // request the records
        const permissionFilters = Record.accessibleBy(
          ability,
          'read'
        ).getFilter();
        let items = await Record.find({
          $and: [cursorFilters, mongooseFilter, permissionFilters],
        }).limit(args.first + 1);
        const hasNextPage = items.length > args.first;
        if (hasNextPage) {
          items = items.slice(0, items.length - 1);
        }
        const edges = items.map((r) => ({
          cursor: encodeCursor(r.id.toString()),
          node: getAccessibleFields(r, ability),
        }));
        return {
          pageInfo: {
            hasNextPage,
            startCursor: edges.length > 0 ? edges[0].cursor : null,
            endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          },
          edges,
          totalCount: await Record.countDocuments({
            $and: [mongooseFilter, permissionFilters],
          }),
        };
      },
    },
    recordsCount: {
      type: GraphQLInt,
      async resolve(parent, args, context) {
        const ability = await extendAbilityForRecords(context.user, parent);
        return Record.accessibleBy(ability, 'read')
          .find({ resource: parent.id, archived: { $ne: true } })
          .count();
      },
    },
    fields: {
      type: GraphQLJSON,
      async resolve(parent, _, context) {
        const ability = await extendAbilityForRecords(context.user, parent);

        return parent.fields.map((field) => ({
          ...field,
          userHasAccess: ability.can('read', parent, `field.${field.name}`),
        }));
      },
    },
    canSee: {
      type: GraphQLBoolean,
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return ability.can('read', parent);
      },
    },
    canUpdate: {
      type: GraphQLBoolean,
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return ability.can('update', parent);
      },
    },
    canDelete: {
      type: GraphQLBoolean,
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return ability.can('delete', parent);
      },
    },
    layouts: {
      type: new GraphQLList(LayoutType),
    },
  }),
});

/** GraphQL resource connection type definition */
export const ResourceConnectionType = Connection(ResourceType);
