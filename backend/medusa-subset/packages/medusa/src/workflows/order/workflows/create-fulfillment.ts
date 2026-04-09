import {
  createWorkflow,
  WorkflowData,
  createStep,
  StepResponse,
} from "@medusajs/workflows-sdk"

type CreateFulfillmentInput = {
  order_id: string
  location_id: string
  items: { id: string; quantity: number }[]
  metadata?: Record<string, unknown>
  no_notification?: boolean
}

// Step 1: Validate fulfillment items
const validateFulfillmentItemsStep = createStep(
  "validate-fulfillment-items",
  async (input: CreateFulfillmentInput, { container }) => {
    const orderModuleService = container.resolve("orderModuleService")

    const order = await orderModuleService.retrieveOrder(input.order_id, {
      relations: ["items", "fulfillments", "fulfillments.items"],
    })

    if (order.canceled_at) {
      throw new Error(`Cannot fulfill canceled order ${input.order_id}`)
    }

    // Calculate already fulfilled quantities per item
    const fulfilledQty: Record<string, number> = {}
    for (const fulfillment of order.fulfillments ?? []) {
      if (fulfillment.canceled_at) continue
      for (const fItem of fulfillment.items ?? []) {
        fulfilledQty[fItem.line_item_id] =
          (fulfilledQty[fItem.line_item_id] ?? 0) + fItem.quantity
      }
    }

    // Validate requested quantities
    for (const requestedItem of input.items) {
      const orderItem = order.items?.find((i) => i.id === requestedItem.id)
      if (!orderItem) {
        throw new Error(`Item ${requestedItem.id} not found in order`)
      }

      const alreadyFulfilled = fulfilledQty[requestedItem.id] ?? 0
      const available = orderItem.quantity - alreadyFulfilled

      if (requestedItem.quantity > available) {
        throw new Error(
          `Insufficient items for fulfillment: ${orderItem.title}. ` +
          `Ordered: ${orderItem.quantity}, Already fulfilled: ${alreadyFulfilled}, ` +
          `Requested: ${requestedItem.quantity}`
        )
      }
    }

    return new StepResponse(order)
  }
)

// Step 2: Deduct inventory
const deductInventoryStep = createStep(
  "deduct-inventory-for-fulfillment",
  async (
    input: { items: { id: string; quantity: number }[]; location_id: string },
    { container }
  ) => {
    const inventoryModuleService = container.resolve("inventoryModuleService")
    const query = container.resolve("query")

    const adjustments: { inventory_item_id: string; location_id: string; quantity: number }[] = []

    for (const item of input.items) {
      // Get inventory item linked to the order item's variant
      const { data: links } = await query.graph({
        entity: "order_item_variant_inventory",
        fields: ["inventory_item_id"],
        filters: { order_item_id: item.id },
      })

      const inventoryItemId = links?.[0]?.inventory_item_id
      if (!inventoryItemId) continue

      // Deduct from stocked_quantity
      await inventoryModuleService.adjustInventory(
        inventoryItemId,
        input.location_id,
        -item.quantity
      )

      adjustments.push({
        inventory_item_id: inventoryItemId,
        location_id: input.location_id,
        quantity: item.quantity,
      })
    }

    return new StepResponse(adjustments)
  },
  // Compensation: restore inventory if fulfillment creation fails
  async (adjustments, { container }) => {
    if (!adjustments?.length) return

    const inventoryModuleService = container.resolve("inventoryModuleService")

    for (const adj of adjustments) {
      await inventoryModuleService.adjustInventory(
        adj.inventory_item_id,
        adj.location_id,
        adj.quantity // Add back the deducted quantity
      )
    }
  }
)

// Step 3: Create fulfillment record
const createFulfillmentRecordStep = createStep(
  "create-fulfillment-record",
  async (input: CreateFulfillmentInput, { container }) => {
    const fulfillmentModuleService = container.resolve("fulfillmentModuleService")

    const fulfillment = await fulfillmentModuleService.createFulfillment({
      location_id: input.location_id,
      items: input.items.map((item) => ({
        line_item_id: item.id,
        quantity: item.quantity,
      })),
      metadata: input.metadata,
    })

    return new StepResponse(fulfillment)
  },
  // Compensation: cancel the fulfillment
  async (fulfillment, { container }) => {
    if (fulfillment?.id) {
      const fulfillmentModuleService = container.resolve("fulfillmentModuleService")
      await fulfillmentModuleService.cancelFulfillment(fulfillment.id)
    }
  }
)

// Step 4: Update order fulfillment status
const updateOrderFulfillmentStatusStep = createStep(
  "update-order-fulfillment-status",
  async (
    input: { order_id: string; all_fulfilled: boolean },
    { container }
  ) => {
    const orderModuleService = container.resolve("orderModuleService")

    const newStatus = input.all_fulfilled
      ? "fulfilled"
      : "partially_fulfilled"

    await orderModuleService.updateOrders([
      { id: input.order_id, fulfillment_status: newStatus },
    ])

    return new StepResponse(newStatus)
  }
)

// Step 5: Emit event
const emitFulfillmentCreatedStep = createStep(
  "emit-fulfillment-created",
  async (
    input: { order_id: string; fulfillment_id: string; no_notification?: boolean },
    { container }
  ) => {
    if (input.no_notification) {
      return new StepResponse(true)
    }

    const eventBusService = container.resolve("eventBusModuleService")

    await eventBusService.emit([
      {
        name: "order.fulfillment_created",
        data: {
          id: input.order_id,
          fulfillment_id: input.fulfillment_id,
        },
      },
    ])

    return new StepResponse(true)
  }
)

// Create Fulfillment Workflow
export const createFulfillmentWorkflow = createWorkflow(
  "create-fulfillment",
  (input: WorkflowData<CreateFulfillmentInput>) => {
    const order = validateFulfillmentItemsStep(input)

    const inventoryAdjustments = deductInventoryStep({
      items: input.items,
      location_id: input.location_id,
    })

    const fulfillment = createFulfillmentRecordStep(input)

    // Check if all items are now fulfilled
    updateOrderFulfillmentStatusStep({
      order_id: input.order_id,
      all_fulfilled: false, // Computed at runtime
    })

    emitFulfillmentCreatedStep({
      order_id: input.order_id,
      fulfillment_id: fulfillment.id,
      no_notification: input.no_notification,
    })

    return order
  }
)
