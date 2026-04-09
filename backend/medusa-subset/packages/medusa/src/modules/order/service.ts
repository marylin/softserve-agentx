import { OrderTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  orderRepository: DAL.RepositoryService
  orderItemRepository: DAL.RepositoryService
  orderChangeRepository: DAL.RepositoryService
  returnRepository: DAL.RepositoryService
  exchangeRepository: DAL.RepositoryService
  claimRepository: DAL.RepositoryService
  transactionRepository: DAL.RepositoryService
}

export default class OrderModuleService {
  protected readonly orderRepository_: DAL.RepositoryService
  protected readonly orderItemRepository_: DAL.RepositoryService
  protected readonly orderChangeRepository_: DAL.RepositoryService
  protected readonly returnRepository_: DAL.RepositoryService

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.orderRepository_ = container.orderRepository
    this.orderItemRepository_ = container.orderItemRepository
    this.orderChangeRepository_ = container.orderChangeRepository
    this.returnRepository_ = container.returnRepository
  }

  // ---- Order CRUD ----

  async createOrders(
    data: OrderTypes.CreateOrderDTO[],
    sharedContext?: Context
  ): Promise<OrderTypes.OrderDTO[]> {
    return await this.orderRepository_.create(data, sharedContext)
  }

  async updateOrders(
    data: OrderTypes.UpdateOrderDTO[],
    sharedContext?: Context
  ): Promise<OrderTypes.OrderDTO[]> {
    return await this.orderRepository_.update(data, sharedContext)
  }

  async retrieveOrder(
    orderId: string,
    config?: OrderTypes.FindConfig<OrderTypes.OrderDTO>,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderDTO> {
    const orders = await this.orderRepository_.find(
      { where: { id: orderId } },
      sharedContext
    )

    if (!orders?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Order with id: ${orderId} was not found`
      )
    }

    return orders[0]
  }

  async listOrders(
    filters?: OrderTypes.FilterableOrderProps,
    config?: OrderTypes.FindConfig<OrderTypes.OrderDTO>,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderDTO[]> {
    return await this.orderRepository_.find(filters, sharedContext)
  }

  async listAndCountOrders(
    filters?: OrderTypes.FilterableOrderProps,
    config?: OrderTypes.FindConfig<OrderTypes.OrderDTO>,
    sharedContext?: Context
  ): Promise<[OrderTypes.OrderDTO[], number]> {
    return await this.orderRepository_.findAndCount(filters, sharedContext)
  }

  // ---- Order Status Management ----

  async cancelOrder(
    orderId: string,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderDTO> {
    const order = await this.retrieveOrder(orderId, {
      relations: ["fulfillments"]
    }, sharedContext)

    if (order.canceled_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Order ${orderId} is already canceled`
      )
    }

    const hasShippedFulfillment = order.fulfillments?.some(
      (f) => f.shipped_at && !f.canceled_at
    )

    if (hasShippedFulfillment) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot cancel order with shipped fulfillments. Process as a return instead.`
      )
    }

    return await this.orderRepository_.update(
      [{ id: orderId, canceled_at: new Date(), status: "canceled" }],
      sharedContext
    )
  }

  async completeOrder(
    orderId: string,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderDTO> {
    const order = await this.retrieveOrder(orderId, {}, sharedContext)

    if (order.canceled_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot complete a canceled order`
      )
    }

    return await this.orderRepository_.update(
      [{ id: orderId, status: "completed" }],
      sharedContext
    )
  }

  async archiveOrder(
    orderId: string,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderDTO> {
    const order = await this.retrieveOrder(orderId, {}, sharedContext)

    if (order.status !== "completed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Only completed orders can be archived. Current status: ${order.status}`
      )
    }

    return await this.orderRepository_.update(
      [{ id: orderId, status: "archived" }],
      sharedContext
    )
  }

  // ---- Returns ----

  async createReturn(
    orderId: string,
    data: OrderTypes.CreateReturnDTO,
    sharedContext?: Context
  ): Promise<OrderTypes.ReturnDTO> {
    const order = await this.retrieveOrder(orderId, {
      relations: ["items"]
    }, sharedContext)

    if (order.canceled_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot create return for canceled order`
      )
    }

    // Validate return items exist in order
    const orderItemIds = new Set(order.items?.map((i) => i.id) ?? [])
    for (const returnItem of data.items) {
      if (!orderItemIds.has(returnItem.item_id)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Item ${returnItem.item_id} not found in order ${orderId}`
        )
      }
    }

    return await this.returnRepository_.create(
      [{ ...data, order_id: orderId }],
      sharedContext
    )
  }

  async receiveReturn(
    returnId: string,
    items: { item_id: string; quantity: number }[],
    sharedContext?: Context
  ): Promise<OrderTypes.ReturnDTO> {
    return await this.returnRepository_.update(
      [{ id: returnId, status: "received", received_at: new Date() }],
      sharedContext
    )
  }

  // ---- Order Changes (Edits, Exchanges, Claims) ----

  async createOrderChange(
    data: OrderTypes.CreateOrderChangeDTO,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderChangeDTO> {
    const order = await this.retrieveOrder(data.order_id, {}, sharedContext)

    // Check for existing pending changes
    const existingChanges = await this.orderChangeRepository_.find(
      { where: { order_id: data.order_id, status: "pending" } },
      sharedContext
    )

    if (existingChanges?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Order ${data.order_id} already has a pending change. Confirm or cancel it first.`
      )
    }

    return await this.orderChangeRepository_.create([data], sharedContext)
  }

  async confirmOrderChange(
    changeId: string,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderChangeDTO> {
    return await this.orderChangeRepository_.update(
      [{ id: changeId, status: "confirmed", confirmed_at: new Date() }],
      sharedContext
    )
  }

  async cancelOrderChange(
    changeId: string,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderChangeDTO> {
    return await this.orderChangeRepository_.update(
      [{ id: changeId, status: "canceled" }],
      sharedContext
    )
  }

  // ---- Transactions (Payment References) ----

  async addOrderTransaction(
    data: OrderTypes.CreateOrderTransactionDTO,
    sharedContext?: Context
  ): Promise<OrderTypes.OrderTransactionDTO> {
    return await this.orderRepository_.create([data], sharedContext)
  }
}
