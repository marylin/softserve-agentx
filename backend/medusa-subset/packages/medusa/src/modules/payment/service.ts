import { PaymentTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  paymentRepository: DAL.RepositoryService
  paymentCollectionRepository: DAL.RepositoryService
  paymentSessionRepository: DAL.RepositoryService
  captureRepository: DAL.RepositoryService
  refundRepository: DAL.RepositoryService
  paymentProviderService: any
}

export default class PaymentModuleService {
  protected readonly paymentRepository_: DAL.RepositoryService
  protected readonly paymentCollectionRepository_: DAL.RepositoryService
  protected readonly paymentSessionRepository_: DAL.RepositoryService
  protected readonly captureRepository_: DAL.RepositoryService
  protected readonly refundRepository_: DAL.RepositoryService
  protected readonly paymentProviderService_: any

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.paymentRepository_ = container.paymentRepository
    this.paymentCollectionRepository_ = container.paymentCollectionRepository
    this.paymentSessionRepository_ = container.paymentSessionRepository
    this.captureRepository_ = container.captureRepository
    this.refundRepository_ = container.refundRepository
    this.paymentProviderService_ = container.paymentProviderService
  }

  // ---- Payment Collections ----

  async createPaymentCollections(
    data: PaymentTypes.CreatePaymentCollectionDTO[],
    sharedContext?: Context
  ): Promise<PaymentTypes.PaymentCollectionDTO[]> {
    return await this.paymentCollectionRepository_.create(data, sharedContext)
  }

  async retrievePaymentCollection(
    id: string,
    config?: PaymentTypes.FindConfig<PaymentTypes.PaymentCollectionDTO>,
    sharedContext?: Context
  ): Promise<PaymentTypes.PaymentCollectionDTO> {
    const collections = await this.paymentCollectionRepository_.find(
      { where: { id } },
      sharedContext
    )

    if (!collections?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Payment collection with id: ${id} was not found`
      )
    }

    return collections[0]
  }

  // ---- Payment Sessions ----

  async createPaymentSession(
    paymentCollectionId: string,
    data: {
      provider_id: string
      currency_code: string
      amount: number
      data?: Record<string, unknown>
    },
    sharedContext?: Context
  ): Promise<PaymentTypes.PaymentSessionDTO> {
    const collection = await this.retrievePaymentCollection(
      paymentCollectionId,
      {},
      sharedContext
    )

    // Verify provider exists
    const provider = await this.paymentProviderService_.retrieveProvider(
      data.provider_id
    )

    if (!provider) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Payment provider ${data.provider_id} not found. Ensure the provider plugin is installed and configured.`
      )
    }

    // Initialize session with the provider (e.g., create Stripe PaymentIntent)
    const providerSession = await this.paymentProviderService_.createSession(
      data.provider_id,
      {
        currency_code: data.currency_code,
        amount: data.amount,
        context: data.data,
      }
    )

    const session = await this.paymentSessionRepository_.create(
      [{
        payment_collection_id: paymentCollectionId,
        provider_id: data.provider_id,
        currency_code: data.currency_code,
        amount: data.amount,
        status: "pending",
        data: providerSession,
        is_selected: true,
        is_initiated: true,
      }],
      sharedContext
    )

    return session[0]
  }

  async authorizePaymentSession(
    paymentSessionId: string,
    context?: Record<string, unknown>,
    sharedContext?: Context
  ): Promise<PaymentTypes.PaymentSessionDTO> {
    const sessions = await this.paymentSessionRepository_.find(
      { where: { id: paymentSessionId } },
      sharedContext
    )

    if (!sessions?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Payment session ${paymentSessionId} not found`
      )
    }

    const session = sessions[0]

    // Authorize with the provider
    const authResult = await this.paymentProviderService_.authorizePayment(
      session.provider_id,
      {
        session_data: session.data,
        context,
      }
    )

    if (authResult.status === "requires_more") {
      // 3D Secure or additional authentication needed
      return await this.paymentSessionRepository_.update(
        [{
          id: paymentSessionId,
          status: "requires_more",
          data: authResult.data,
        }],
        sharedContext
      )
    }

    if (authResult.status === "error") {
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Payment authorization failed: ${authResult.error_message}`
      )
    }

    // Authorization successful
    const updated = await this.paymentSessionRepository_.update(
      [{
        id: paymentSessionId,
        status: "authorized",
        data: authResult.data,
        authorized_at: new Date(),
      }],
      sharedContext
    )

    return updated[0]
  }

  async deletePaymentSession(
    id: string,
    sharedContext?: Context
  ): Promise<void> {
    const sessions = await this.paymentSessionRepository_.find(
      { where: { id } },
      sharedContext
    )

    if (sessions?.length) {
      // Cancel with provider if initiated
      if (sessions[0].is_initiated) {
        await this.paymentProviderService_.cancelSession(
          sessions[0].provider_id,
          sessions[0].data
        )
      }

      await this.paymentSessionRepository_.delete([id], sharedContext)
    }
  }

  // ---- Payments (post-authorization) ----

  async capturePayment(
    paymentId: string,
    amount?: number,
    sharedContext?: Context
  ): Promise<PaymentTypes.PaymentDTO> {
    const payments = await this.paymentRepository_.find(
      { where: { id: paymentId } },
      sharedContext
    )

    if (!payments?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Payment ${paymentId} not found`
      )
    }

    const payment = payments[0]

    if (payment.canceled_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot capture a canceled payment`
      )
    }

    const captureAmount = amount ?? payment.amount

    // Capture with the provider
    const captureResult = await this.paymentProviderService_.capturePayment(
      payment.provider_id,
      {
        payment_data: payment.data,
        amount: captureAmount,
      }
    )

    // Create capture record
    await this.captureRepository_.create(
      [{
        payment_id: paymentId,
        amount: captureAmount,
      }],
      sharedContext
    )

    // Update payment
    return await this.paymentRepository_.update(
      [{
        id: paymentId,
        data: captureResult.data,
        captured_at: payment.captured_at ?? new Date(),
      }],
      sharedContext
    )
  }

  async refundPayment(
    paymentId: string,
    amount: number,
    reason?: string,
    note?: string,
    sharedContext?: Context
  ): Promise<PaymentTypes.PaymentDTO> {
    const payments = await this.paymentRepository_.find(
      { where: { id: paymentId }, relations: ["captures", "refunds"] },
      sharedContext
    )

    if (!payments?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Payment ${paymentId} not found`
      )
    }

    const payment = payments[0]

    // Calculate available refund balance
    const totalCaptured = payment.captures?.reduce(
      (sum: number, c: any) => sum + c.amount, 0
    ) ?? 0
    const totalRefunded = payment.refunds?.reduce(
      (sum: number, r: any) => sum + r.amount, 0
    ) ?? 0
    const availableForRefund = totalCaptured - totalRefunded

    if (amount > availableForRefund) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Refund amount (${amount}) exceeds available balance (${availableForRefund})`
      )
    }

    // Refund with the provider
    await this.paymentProviderService_.refundPayment(
      payment.provider_id,
      {
        payment_data: payment.data,
        amount,
      }
    )

    // Create refund record
    await this.refundRepository_.create(
      [{
        payment_id: paymentId,
        amount,
        reason,
        note,
      }],
      sharedContext
    )

    return payment
  }

  // ---- Webhook Processing ----

  async processWebhookEvent(
    providerId: string,
    payload: Record<string, unknown>,
    sharedContext?: Context
  ): Promise<void> {
    // Verify webhook signature with provider
    const event = await this.paymentProviderService_.parseWebhook(
      providerId,
      payload
    )

    switch (event.type) {
      case "payment_intent.succeeded":
        // Update payment session status
        break
      case "payment_intent.payment_failed":
        // Mark payment session as failed
        break
      case "charge.refunded":
        // Record external refund
        break
      default:
        // Log unhandled event type
        break
    }
  }
}
