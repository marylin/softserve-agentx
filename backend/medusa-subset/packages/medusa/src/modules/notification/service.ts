import { NotificationTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  notificationRepository: DAL.RepositoryService
  notificationProviderRepository: DAL.RepositoryService
  notificationProviders: Map<string, any>
}

export default class NotificationModuleService {
  protected readonly notificationRepository_: DAL.RepositoryService
  protected readonly notificationProviderRepository_: DAL.RepositoryService
  protected readonly providers_: Map<string, any>

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.notificationRepository_ = container.notificationRepository
    this.notificationProviderRepository_ = container.notificationProviderRepository
    this.providers_ = container.notificationProviders
  }

  // ---- Send Notifications ----

  async createNotifications(
    data: NotificationTypes.CreateNotificationDTO[],
    sharedContext?: Context
  ): Promise<NotificationTypes.NotificationDTO[]> {
    const results: NotificationTypes.NotificationDTO[] = []

    for (const notification of data) {
      const provider = this.providers_.get(notification.provider_id)

      if (!provider) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          `Notification provider "${notification.provider_id}" not found. ` +
          `Available providers: ${Array.from(this.providers_.keys()).join(", ")}`
        )
      }

      // Create notification record
      const [record] = await this.notificationRepository_.create(
        [{
          ...notification,
          status: "pending",
        }],
        sharedContext
      )

      try {
        // Send through provider
        const sendResult = await provider.send({
          to: notification.to,
          channel: notification.channel,
          template: notification.template,
          data: notification.data,
        })

        // Update with success status
        const [updated] = await this.notificationRepository_.update(
          [{
            id: record.id,
            status: "sent",
            external_id: sendResult.id,
          }],
          sharedContext
        )

        results.push(updated)
      } catch (error) {
        // Update with failed status
        await this.notificationRepository_.update(
          [{
            id: record.id,
            status: "failed",
            metadata: {
              ...record.metadata,
              error: error.message,
              failed_at: new Date().toISOString(),
            },
          }],
          sharedContext
        )

        // Don't throw - notification failures should not block business operations
        console.error(
          `Notification delivery failed for ${notification.to}:`,
          error.message
        )

        results.push({
          ...record,
          status: "failed",
        })
      }
    }

    return results
  }

  // ---- Resend ----

  async resendNotification(
    id: string,
    sharedContext?: Context
  ): Promise<NotificationTypes.NotificationDTO> {
    const notifications = await this.notificationRepository_.find(
      { where: { id } },
      sharedContext
    )

    if (!notifications?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Notification ${id} not found`
      )
    }

    const notification = notifications[0]

    // Re-send using original data
    const [result] = await this.createNotifications(
      [{
        to: notification.to,
        channel: notification.channel,
        template: notification.template,
        data: notification.data,
        provider_id: notification.provider_id,
        trigger_type: notification.trigger_type,
        resource_id: notification.resource_id,
        resource_type: notification.resource_type,
        receiver_id: notification.receiver_id,
      }],
      sharedContext
    )

    return result
  }

  // ---- List / Retrieve ----

  async listNotifications(
    filters?: NotificationTypes.FilterableNotificationProps,
    config?: NotificationTypes.FindConfig<NotificationTypes.NotificationDTO>,
    sharedContext?: Context
  ): Promise<NotificationTypes.NotificationDTO[]> {
    return await this.notificationRepository_.find(filters, sharedContext)
  }

  async listAndCountNotifications(
    filters?: NotificationTypes.FilterableNotificationProps,
    config?: NotificationTypes.FindConfig<NotificationTypes.NotificationDTO>,
    sharedContext?: Context
  ): Promise<[NotificationTypes.NotificationDTO[], number]> {
    return await this.notificationRepository_.findAndCount(filters, sharedContext)
  }

  async retrieveNotification(
    id: string,
    config?: NotificationTypes.FindConfig<NotificationTypes.NotificationDTO>,
    sharedContext?: Context
  ): Promise<NotificationTypes.NotificationDTO> {
    const notifications = await this.notificationRepository_.find(
      { where: { id } },
      sharedContext
    )

    if (!notifications?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Notification ${id} not found`
      )
    }

    return notifications[0]
  }

  // ---- Provider Management ----

  async listNotificationProviders(
    sharedContext?: Context
  ): Promise<NotificationTypes.NotificationProviderDTO[]> {
    return await this.notificationProviderRepository_.find({}, sharedContext)
  }
}
