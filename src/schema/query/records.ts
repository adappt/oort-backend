import { GraphQLError, GraphQLList } from 'graphql';
import { RecordType } from '../types';
import { Record } from '../../models';
import extendAbilityForRecords from '../../security/extendAbilityForRecords';
import { pick } from 'lodash';

/**
 * List all records available for the logged user.
 * Throw GraphQL error if not logged.
 */
export default {
  type: new GraphQLList(RecordType),
  async resolve(parent, args, context) {
    // Authentication check
    const user = context.user;
    if (!user) {
      throw new GraphQLError(context.i18next.t('errors.userNotLogged'));
    }

    const ability = await extendAbilityForRecords(user);
    // Return the records
    const records = await Record.accessibleBy(ability, 'read').find();
    return records.map((record) => ({
      ...record.toObject(),
      data: pick(record, record.accessibleFieldsBy(ability)).data,
    }));
  },
};
