import { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import { MedusaError } from "@medusajs/utils"
import {
  createCartsWorkflow,
  addToCartWorkflow,
  updateLineItemInCartWorkflow,
  deleteLineItemsWorkflow,
  addShippingMethodToCartWorkflow,
  completeCartWorkflow,
} from "../../../workflows/cart/workflows"

// POST /store/carts - Create a new cart
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { result } = await createCartsWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      sales_channel_id: req.publishableApiKeyScopes?.sales_channel_ids?.[0],
    },
  })

  res.status(200).json({ cart: result })
}

// GET /store/carts/:id - Retrieve a cart
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const query = req.scope.resolve("query")
  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: req.remoteQueryConfig.fields,
    filters: { id },
  })

  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ${id} not found`)
  }

  res.status(200).json({ cart })
}

// Route: /store/carts/:id/line-items
export const lineItems = {
  // POST /store/carts/:id/line-items - Add a line item
  POST: async (req: MedusaRequest, res: MedusaResponse) => {
    const { id } = req.params

    const { result } = await addToCartWorkflow(req.scope).run({
      input: {
        cart_id: id,
        items: [req.validatedBody],
      },
    })

    res.status(200).json({ cart: result })
  },
}

// Route: /store/carts/:id/line-items/:line_id
export const lineItemById = {
  // POST /store/carts/:id/line-items/:line_id - Update a line item
  POST: async (req: MedusaRequest, res: MedusaResponse) => {
    const { id, line_id } = req.params

    const { result } = await updateLineItemInCartWorkflow(req.scope).run({
      input: {
        cart_id: id,
        item_id: line_id,
        ...req.validatedBody,
      },
    })

    res.status(200).json({ cart: result })
  },

  // DELETE /store/carts/:id/line-items/:line_id - Remove a line item
  DELETE: async (req: MedusaRequest, res: MedusaResponse) => {
    const { id, line_id } = req.params

    await deleteLineItemsWorkflow(req.scope).run({
      input: {
        cart_id: id,
        ids: [line_id],
      },
    })

    res.status(200).json({ cart_id: id, line_item_id: line_id, deleted: true })
  },
}

// Route: /store/carts/:id/shipping-methods
export const shippingMethods = {
  // POST /store/carts/:id/shipping-methods - Add a shipping method
  POST: async (req: MedusaRequest, res: MedusaResponse) => {
    const { id } = req.params

    const { result } = await addShippingMethodToCartWorkflow(req.scope).run({
      input: {
        cart_id: id,
        ...req.validatedBody,
      },
    })

    res.status(200).json({ cart: result })
  },
}

// Route: /store/carts/:id/complete
export const complete = {
  // POST /store/carts/:id/complete - Complete the cart (create order)
  POST: async (req: MedusaRequest, res: MedusaResponse) => {
    const { id } = req.params

    try {
      const { result } = await completeCartWorkflow(req.scope).run({
        input: { cart_id: id },
      })

      res.status(200).json({
        type: result.type,
        order: result.order,
        cart: result.cart,
      })
    } catch (error) {
      if (error.type === "payment_authorization_error") {
        res.status(422).json({
          type: "cart",
          cart: { id },
          message: "Payment authorization required",
        })
        return
      }
      throw error
    }
  },
}
