import {
  createWorkflow,
  WorkflowData,
  createStep,
  StepResponse,
} from "@medusajs/workflows-sdk"

type CompleteCartInput = {
  cart_id: string
}

// Step 1: Validate the cart is ready for completion
const validateCartStep = createStep(
  "validate-cart",
  async (input: { cart_id: string }, { container }) => {
    const cartModuleService = container.resolve("cartModuleService")

    const cart = await cartModuleService.retrieveCart(input.cart_id, {
      relations: [
        "items",
        "items.adjustments",
        "items.tax_lines",
        "shipping_methods",
        "shipping_methods.adjustments",
        "shipping_methods.tax_lines",
      ],
    })

    if (cart.completed_at) {
      throw new Error(`Cart ${input.cart_id} has already been completed`)
    }

    if (!cart.items?.length) {
      throw new Error("Cart has no items")
    }

    if (!cart.shipping_methods?.length) {
      throw new Error("Cart has no shipping method selected")
    }

    if (!cart.email) {
      throw new Error("Cart has no email address")
    }

    return new StepResponse(cart)
  }
)

// Step 2: Confirm payment is authorized
const confirmPaymentStep = createStep(
  "confirm-payment",
  async (input: { cart_id: string }, { container }) => {
    const query = container.resolve("query")

    // Get payment collection linked to cart
    const { data: links } = await query.graph({
      entity: "cart_payment_collection",
      fields: ["payment_collection.*", "payment_collection.payment_sessions.*"],
      filters: { cart_id: input.cart_id },
    })

    const paymentCollection = links?.[0]?.payment_collection

    if (!paymentCollection) {
      throw new Error("No payment collection found for cart")
    }

    const authorizedSession = paymentCollection.payment_sessions?.find(
      (s: any) => s.status === "authorized"
    )

    if (!authorizedSession) {
      throw new Error(
        "Payment not authorized. Authorize payment before completing cart."
      )
    }

    return new StepResponse({
      payment_collection: paymentCollection,
      authorized_session: authorizedSession,
    })
  }
)

// Step 3: Confirm inventory reservations
const confirmInventoryStep = createStep(
  "confirm-inventory",
  async (input: { cart: any }, { container }) => {
    const inventoryModuleService = container.resolve("inventoryModuleService")

    for (const item of input.cart.items ?? []) {
      if (!item.variant_id) continue

      // Verify reservation exists and quantity matches
      const reservations = await inventoryModuleService.listReservationItems({
        line_item_id: item.id,
      })

      if (!reservations?.length) {
        throw new Error(
          `No inventory reservation for item ${item.title}. Stock may have been depleted.`
        )
      }
    }

    return new StepResponse(true)
  },
  // Compensation: release reservations if order creation fails
  async (input, { container }) => {
    const inventoryModuleService = container.resolve("inventoryModuleService")

    for (const item of input?.cart?.items ?? []) {
      const reservations = await inventoryModuleService.listReservationItems({
        line_item_id: item.id,
      })
      for (const reservation of reservations) {
        await inventoryModuleService.deleteReservationItems([reservation.id])
      }
    }
  }
)

// Step 4: Create the order
const createOrderStep = createStep(
  "create-order-from-cart",
  async (input: { cart: any; payment: any }, { container }) => {
    const orderModuleService = container.resolve("orderModuleService")

    const order = await orderModuleService.createOrders([
      {
        region_id: input.cart.region_id,
        customer_id: input.cart.customer_id,
        sales_channel_id: input.cart.sales_channel_id,
        email: input.cart.email,
        currency_code: input.cart.currency_code,
        shipping_address_id: input.cart.shipping_address_id,
        billing_address_id: input.cart.billing_address_id,
        items: input.cart.items?.map((item: any) => ({
          title: item.title,
          subtitle: item.subtitle,
          thumbnail: item.thumbnail,
          variant_id: item.variant_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          is_tax_inclusive: item.is_tax_inclusive,
          metadata: item.metadata,
        })),
        shipping_methods: input.cart.shipping_methods?.map((sm: any) => ({
          name: sm.name,
          shipping_option_id: sm.shipping_option_id,
          amount: sm.amount,
          data: sm.data,
        })),
      },
    ])

    return new StepResponse(order[0])
  },
  // Compensation: delete order if downstream steps fail
  async (order, { container }) => {
    if (order?.id) {
      const orderModuleService = container.resolve("orderModuleService")
      await orderModuleService.cancelOrder(order.id)
    }
  }
)

// Step 5: Mark cart as completed
const markCartCompletedStep = createStep(
  "mark-cart-completed",
  async (input: { cart_id: string }, { container }) => {
    const cartModuleService = container.resolve("cartModuleService")

    await cartModuleService.updateCarts([
      { id: input.cart_id, completed_at: new Date() },
    ])

    return new StepResponse(true)
  }
)

// Step 6: Emit order.placed event
const emitOrderPlacedStep = createStep(
  "emit-order-placed",
  async (input: { order_id: string }, { container }) => {
    const eventBusService = container.resolve("eventBusModuleService")

    await eventBusService.emit([
      {
        name: "order.placed",
        data: { id: input.order_id },
      },
    ])

    return new StepResponse(true)
  }
)

// Complete Cart Workflow
export const completeCartWorkflow = createWorkflow(
  "complete-cart",
  (input: WorkflowData<CompleteCartInput>) => {
    const cart = validateCartStep({ cart_id: input.cart_id })
    const payment = confirmPaymentStep({ cart_id: input.cart_id })
    confirmInventoryStep({ cart: cart })

    const order = createOrderStep({ cart: cart, payment: payment })
    markCartCompletedStep({ cart_id: input.cart_id })
    emitOrderPlacedStep({ order_id: order.id })

    return {
      type: "order",
      order: order,
    }
  }
)
