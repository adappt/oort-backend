import { GraphQLNonNull, GraphQLID, GraphQLError } from "graphql";
import errors from "../../const/errors";
import permissions from "../../const/permissions";
import checkPermission from "../../utils/checkPermission";
import { FormType } from "../types";
import mongoose from 'mongoose';
import { Form } from "../../models";
import { AppAbility } from "../../security/defineAbilityFor";

export default {
    /*  Returns form from id if available for the logged user.
        Throw GraphQL error if not logged.
    */
    type: FormType,
    args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
    },
    async resolve(parent, args, context) {
        let form = null;
        const ability: AppAbility = context.user.ability;
        const filters = Form.accessibleBy(ability, 'read').where({_id: args.id}).getFilter();
        form = await Form.findOne(filters);
        if (!form) {
            throw new GraphQLError(errors.permissionNotGranted);
        }
        return form;
    },
}