import errors from '../../const/errors';
import { GraphQLError, GraphQLID, GraphQLNonNull } from 'graphql';
import { Application } from '../../models';
import { TemplateType } from '../types';
import { AppAbility } from '../../security/defineAbilityFor';
import TemplateInputType from '../inputs/template.input';
import extendAbilityForApplications from '../../security/extendAbilityForApplication';

export default {
  type: TemplateType,
  args: {
    application: { type: new GraphQLNonNull(GraphQLID) },
    template: { type: new GraphQLNonNull(TemplateInputType) },
  },
  async resolve(_, args, context) {
    const user = context.user;
    if (!user) {
      throw new GraphQLError(errors.userNotLogged);
    }
    const ability: AppAbility = await extendAbilityForApplications(
      user,
      args.application
    );
    if (ability.cannot('update', 'Template')) {
      throw new GraphQLError(errors.permissionNotGranted);
    }

    const update = {
      $addToSet: {
        templates: {
          name: args.template.name,
          type: args.template.type,
          content: args.template.content,
        },
      },
    };

    const application = await Application.findByIdAndUpdate(
      args.application,
      update,
      { new: true }
    );

    return application.templates.pop();
  },
};
