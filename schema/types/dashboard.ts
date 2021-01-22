import { GraphQLObjectType, GraphQLID, GraphQLString, GraphQLBoolean } from "graphql";
import GraphQLJSON from "graphql-type-json";
import { AccessType, PageType, StepType } from ".";
import permissions from "../../const/permissions";
import { Page, Step } from "../../models";
import checkPermission from "../../utils/checkPermission";

export const DashboardType = new GraphQLObjectType({
    name: 'Dashboard',
    fields: () => ({
        id: { type: GraphQLID },
        name: { type: GraphQLString },
        createdAt: { type: GraphQLString },
        modifiedAt: { type: GraphQLString },
        structure: { type: GraphQLJSON },
        permissions: {
            type: AccessType,
            async resolve(parent, args) {
                const page = await Page.findOne({ content: parent.id })
                if (page) return page.permissions;
                const step = await Step.findOne({ content: parent.id })
                return step.permissions;
            }
        },
        page: {
            type: PageType,
            resolve(parent, args) {
                return Page.findOne({ content: parent.id });
            }
        },
        step: {
            type : StepType,
            resolve(parent, args) {
                return Step.findOne({ content: parent.id });
            }
        },
        canSee: {
            type: GraphQLBoolean,
            resolve(parent, args, context) {
                const user = context.user;
                return checkPermission(user, permissions.canSeeApplications)
            }
        },
        canUpdate: {
            type: GraphQLBoolean,
            resolve(parent, args, context) {
                const user = context.user;
                return checkPermission(user, permissions.canManageApplications)
            }
        },
        canDelete: {
            type: GraphQLBoolean,
            resolve(parent, args, context) {
                const user = context.user;
                return checkPermission(user, permissions.canManageApplications)
            }
        }
    })
});