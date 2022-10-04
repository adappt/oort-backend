import mongoose from 'mongoose';
import { GraphQLNonNull, GraphQLID, GraphQLList, GraphQLError } from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { ResourceType } from '../types';
import { Resource } from '../../models';
import { buildTypes } from '../../utils/schema';
import { AppAbility } from '../../security/defineUserAbility';
import { isArray } from 'lodash';
import { findDuplicateFields } from '../../utils/form';

/** Simple resource permission change type */
type SimplePermissionChange =
  | {
      add?: string[];
      remove?: string[];
    }
  | string[];

/** Access resource permission change type */
type AccessPermissionChange =
  | {
      add?: { role: string; access?: any }[];
      remove?: { role: string; access?: any }[];
      // update?: { [role: string]: { access: any } }[];
    }
  | { role: string; access?: any }[];

/** Type for the permission argument */
type PermissionChange = {
  canSee?: SimplePermissionChange;
  canUpdate?: SimplePermissionChange;
  canDelete?: SimplePermissionChange;
  canSeeRecords?: AccessPermissionChange;
  canUpdateRecords?: AccessPermissionChange;
  canDeleteRecords?: AccessPermissionChange;
  recordsUnicity?: AccessPermissionChange;
};

/** Simple resource field permission change type */
type SimpleFieldPermissionChange = {
  add?: { field: string; role: string };
  remove?: { field: string; role: string };
};

/** Type for the fieldPermission argument */
type FieldPermissionChange = {
  canSee?: SimpleFieldPermissionChange;
  canUpdate?: SimpleFieldPermissionChange;
};

/** Type for the calculated field argument */
type CalculatedFieldChange = {
  add?: { name: string; expression: string };
  remove?: { name: string };
  update?: { oldName: string; name: string; expression: string };
};

/**
 * Edit an existing resource.
 * Throw GraphQL error if not logged or authorized.
 */
export default {
  type: ResourceType,
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    fields: { type: new GraphQLList(GraphQLJSON) },
    permissions: { type: GraphQLJSON },
    fieldsPermissions: { type: GraphQLJSON },
    calculatedField: { type: GraphQLJSON },
  },
  async resolve(parent, args, context) {
    // Authentication check
    const user = context.user;
    if (!user) {
      throw new GraphQLError(context.i18next.t('errors.userNotLogged'));
    }
    if (
      !args ||
      (!args.fields &&
        !args.permissions &&
        !args.calculatedField &&
        !args.fieldsPermissions)
    ) {
      throw new GraphQLError(
        context.i18next.t('errors.invalidEditResourceArguments')
      );
    }

    // check ability
    const ability: AppAbility = user.ability;
    const resource = await Resource.findById(args.id);
    if (ability.cannot('update', resource)) {
      throw new GraphQLError(context.i18next.t('errors.permissionNotGranted'));
    }

    // Create the update object
    const update: any = {
      modifiedAt: new Date(),
    };
    // Tell if it is required to build types
    let updateGraphQL = (args.fields && true) || false;
    Object.assign(update, args.fields && { fields: args.fields });

    // Update permissions
    if (args.permissions) {
      const permissions: PermissionChange = args.permissions;
      for (const permission in permissions) {
        if (isArray(permissions[permission])) {
          // if it's an array, replace the old value with the provided list
          update['permissions.' + permission] = permissions[permission];
        } else {
          const obj = permissions[permission];
          // if (obj.update) {
          //   const keys = Object.keys(obj.update);
          //   keys.forEach((key) => {
          //     permBulkUpdate.push({
          //       updateOne: {
          //         filter: {
          //           _id: resource._id,
          //           [`permissions.${permission}.role`]:
          //             new mongoose.Types.ObjectId(key),
          //         },
          //         update: {
          //           $set: {
          //             [`permissions.${permission}.$.access`]:
          //               obj.update[key].access,
          //           },
          //         },
          //       },
          //     });
          //   });
          // }
          if (obj.add && obj.add.length) {
            const pushRoles = {
              [`permissions.${permission}`]: { $each: obj.add },
            };

            if (update.$addToSet) Object.assign(update.$addToSet, pushRoles);
            else Object.assign(update, { $addToSet: pushRoles });
          }
          if (obj.remove && obj.remove.length) {
            let pullRoles: any;

            if (typeof obj.remove[0] === 'string') {
              // CanSee, canUpdate, canDelete
              pullRoles = {
                [`permissions.${permission}`]: {
                  $in: obj.remove.map(
                    (role: any) => new mongoose.Types.ObjectId(role)
                  ),
                },
              };
            } else {
              // canCreateRecords, canSeeRecords, canUpdateRecords, canDeleteRecords
              pullRoles = {
                [`permissions.${permission}`]: {
                  $in: obj.remove.map((perm: any) =>
                    perm.access
                      ? {
                          role: new mongoose.Types.ObjectId(perm.role),
                          access: perm.access,
                        }
                      : {
                          role: new mongoose.Types.ObjectId(perm.role),
                        }
                  ),
                },
              };
            }

            if (update.$pull) Object.assign(update.$pull, pullRoles);
            else Object.assign(update, { $pull: pullRoles });
          }
        }
      }
    }

    const allResourceFields = (await Resource.findById(args.id)).fields;

    // Updating field permissions
    if (args.fieldsPermissions) {
      const permissions: FieldPermissionChange = args.fieldsPermissions;
      for (const permission in permissions) {
        const obj = permissions[permission];
        if (obj.add) {
          const fieldIndex = allResourceFields.findIndex(
            (r) => r.name === obj.add.field
          );
          if (fieldIndex === -1) continue;
          const pushRoles = {
            [`fields.${fieldIndex}.permissions.${permission}`]:
              new mongoose.Types.ObjectId(obj.add.role),
          };

          if (update.$addToSet) Object.assign(update.$addToSet, pushRoles);
          else Object.assign(update, { $addToSet: pushRoles });
        }
        if (obj.remove) {
          const fieldIndex = allResourceFields.findIndex(
            (r) => r.name === obj.remove.field
          );
          if (fieldIndex === -1) continue;
          const pullRoles = {
            [`fields.${fieldIndex}.permissions.${permission}`]:
              new mongoose.Types.ObjectId(obj.remove.role),
          };

          if (update.$pull) Object.assign(update.$pull, pullRoles);
          else Object.assign(update, { $pull: pullRoles });
        }
      }
    }

    const arrayFilters: any[] = [];
    // Update calculated fields
    if (args.calculatedField) {
      const calculatedField: CalculatedFieldChange = args.calculatedField;
      // Add new calculated field
      if (calculatedField.add) {
        const pushCalculatedField = {
          fields: {
            name: calculatedField.add.name,
            expression: calculatedField.add.expression,
            type: 'calculated',
          },
        };

        findDuplicateFields([
          ...allResourceFields,
          { name: calculatedField.add.name },
        ]);

        if (update.$addToSet)
          Object.assign(update.$addToSet, pushCalculatedField);
        else Object.assign(update, { $addToSet: pushCalculatedField });
      }
      // Remove existing field
      if (calculatedField.remove) {
        const pullCalculatedField = {
          fields: {
            name: calculatedField.remove.name,
          },
        };

        if (update.$pull) Object.assign(update.$pull, pullCalculatedField);
        else Object.assign(update, { $pull: pullCalculatedField });
      }
      // Update existing field
      if (calculatedField.update) {
        const updateCalculatedFields = {
          'fields.$[element].expression': calculatedField.update.expression,
          'fields.$[element].name': calculatedField.update.name,
        };

        // if old name is different than new name, test duplication
        if (calculatedField.update.name !== calculatedField.update.oldName) {
          allResourceFields.push({
            name: calculatedField.update.name,
          });
        }

        if (update.$set) Object.assign(update.$set, updateCalculatedFields);
        else Object.assign(update, { $set: updateCalculatedFields });
        arrayFilters.push({ 'element.name': calculatedField.update.oldName });
      }
      updateGraphQL = true;
    }

    return Resource.findByIdAndUpdate(
      args.id,
      update,
      { new: true, arrayFilters },
      () => updateGraphQL && buildTypes()
    );
  },
};
