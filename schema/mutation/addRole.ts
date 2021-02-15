import { GraphQLNonNull, GraphQLString, GraphQLID, GraphQLError } from "graphql";
import errors from "../../const/errors";
import { Role, Application } from "../../models";
import { RoleType } from "../types";

export default {
    /*  Creates a new role.
        Throws an error if not logged or authorized.
    */
    type: RoleType,
    args: {
        title: { type: new GraphQLNonNull(GraphQLString) },
        application: { type: GraphQLID }
    },
    async resolve(parent, args, context) {
        if (context.user.ability.can('create', 'Role')) {
            const role = new Role({
                title: args.title
            });
            if (args.application) {
                const application = await Application.findById(args.application);
                if (!application) throw new GraphQLError(errors.dataNotFound);
                role.application = args.application;
            }
            return role.save();
        } else {
            throw new GraphQLError(errors.permissionNotGranted);
        }
    },
}