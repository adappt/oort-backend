import { GraphQLNonNull, GraphQLString, GraphQLID, GraphQLError } from "graphql";
import errors from "../../const/errors";
import permissions from "../../const/permissions";
import checkPermission from "../../utils/checkPermission";
import { RoleType } from "../types";
import Role from '../../models/role';
import Application from '../../models/application';

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
        const user = context.user;
        if (checkPermission(user, permissions.canSeeRoles)) {
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