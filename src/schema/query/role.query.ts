import { GraphQLID, GraphQLError, GraphQLNonNull } from 'graphql';
import { Role } from '@models';
import { RoleType } from '../types';
import { AppAbility } from '@security/defineUserAbility';
import { logger } from '@services/logger.service';
import { accessibleBy } from '@casl/mongoose';
import { graphQLAuthCheck } from '@schema/shared';

/**
 * Get Query by ID.
 * Throw error if user is not logged, or does not have permission to see role, or role does not exist.
 */
export default {
  type: RoleType,
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
  },
  async resolve(parent, args, context) {
    graphQLAuthCheck(context);
    try {
      const ability: AppAbility = context.user.ability;
      if (ability.can('read', 'Role')) {
        try {
          const role = await Role.findOne({
            _id: args.id,
            ...accessibleBy(ability, 'read').Role,
          });
          if (!role) {
            throw new GraphQLError(
              context.i18next.t('common.errors.dataNotFound')
            );
          }
          return role;
        } catch {
          throw new GraphQLError(
            context.i18next.t('common.errors.dataNotFound')
          );
        }
      } else {
        throw new GraphQLError(
          context.i18next.t('common.errors.permissionNotGranted')
        );
      }
    } catch (err) {
      logger.error(err.message, { stack: err.stack });
      if (err instanceof GraphQLError) {
        throw new GraphQLError(err.message);
      }
      throw new GraphQLError(
        context.i18next.t('common.errors.internalServerError')
      );
    }
  },
};
