import { GraphQLError, GraphQLID, GraphQLNonNull } from 'graphql';
import { Application } from '@models';
import { CustomNotificationType } from '../types';
import { AppAbility } from '@security/defineUserAbility';
import CustomNotificationInputType from '../inputs/customNotification.input';
import extendAbilityForApplications from '@security/extendAbilityForApplication';
import { scheduleCustomNotificationJob } from '../../server/customNotificationScheduler';
import { logger } from '@services/logger.service';
import { customNotificationStatus } from '@const/enumTypes';

/**
 * Mutation to add a new custom notification.
 */
export default {
  type: CustomNotificationType,
  args: {
    application: { type: new GraphQLNonNull(GraphQLID) },
    notification: { type: new GraphQLNonNull(CustomNotificationInputType) },
  },
  async resolve(_, args, context) {
    const user = context.user;
    if (!user) {
      throw new GraphQLError(context.i18next.t('errors.userNotLogged'));
    }
    const ability: AppAbility = extendAbilityForApplications(
      user,
      args.application
    );
    if (ability.cannot('create', 'CustomNotification')) {
      throw new GraphQLError(context.i18next.t('errors.permissionNotGranted'));
    }
    try {
      const update = {
        $addToSet: {
          customNotifications: {
            name: args.notification.name,
            description: args.notification.description,
            schedule: args.notification.schedule,
            notificationType: args.notification.notificationType,
            resource: args.notification.resource,
            layout: args.notification.layout,
            template: args.notification.template,
            recipients: args.notification.recipients,
            status: args.notification.notification_status,
          },
        },
      };

      const application = await Application.findByIdAndUpdate(
        args.application,
        update,
        { new: true }
      );
      const notificationDetail = application.customNotifications.pop();
      if (
        args.notification.notification_status ===
        customNotificationStatus.active
      ) {
        scheduleCustomNotificationJob(notificationDetail, application);
      }
      return notificationDetail;
    } catch (err) {
      logger.error(err.message);
      throw new GraphQLError(err.message);
    }
  },
};
