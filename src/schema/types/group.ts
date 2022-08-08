import {
  GraphQLObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLInt,
} from 'graphql';
import { User } from '../../models';

/** GraphQL Group type definition */
export const GroupType = new GraphQLObjectType({
  name: 'Group',
  fields: () => ({
    id: {
      type: GraphQLID,
      resolve(parent) {
        return parent._id;
      },
    },
    title: { type: GraphQLString },
    description: { type: GraphQLString },
    // TODO (add roles array)
    // roles: {
    //   type: new GraphQLList(RoleType),
    //   resvolve(parent) {}
    // },
    usersCount: {
      type: GraphQLInt,
      resolve(parent) {
        return User.find({ groups: parent.id }).count();
      },
    },
  }),
});
