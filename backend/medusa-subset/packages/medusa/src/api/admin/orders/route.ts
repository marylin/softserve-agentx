import { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import { MedusaError } from "@medusajs/utils"
import {
  cancelOrderWorkflow,
  createFulfillmentWorkflow,
  createShipmentWorkflow,
  createReturnWorkflow,
  capturePaymentWorkflow,
  refundPaymentWorkflow,
} from "../../../workflows/order/workflows"

// GET /admin/orders - List all orders
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve("query")

  const { data: orders, metadata } = await query.graph({
    entity: "order",
    fields: req.remoteQueryConfig.fields,
    filters: req.filterableFields,
    pagination: req.remoteQueryConfig.pagination,
  })

  res.status(200).json({
    orders,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  })
}

// GET /admin/orders/:id - Get order details
export const getById = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const query = req.scope.resolve("query")

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: req.remoteQueryConfig.fields,
    filters: { id },
  })

  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${id} not found`)
  }

  res.status(200).json({ order })
}

// POST /admin/orders/:id/cancel
export const cancel = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const { result } = await cancelOrderWorkflow(req.scope).run({
    input: { order_id: id },
  })

  res.status(200).json({ order: result })
}

// POST /admin/orders/:id/fulfillments
export const createFulfillment = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const { result } = await createFulfillmentWorkflow(req.scope).run({
    input: {
      order_id: id,
      ...req.validatedBody,
    },
  })

  res.status(200).json({ order: result })
}

// POST /admin/orders/:id/fulfillments/:fulfillment_id/shipments
export const createShipment = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id, fulfillment_id } = req.params

  const { result } = await createShipmentWorkflow(req.scope).run({
    input: {
      order_id: id,
      fulfillment_id,
      ...req.validatedBody,
    },
  })

  res.status(200).json({ order: result })
}

// POST /admin/orders/:id/returns
export const createReturn = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const { result } = await createReturnWorkflow(req.scope).run({
    input: {
      order_id: id,
      ...req.validatedBody,
    },
  })

  res.status(200).json({ order: result.order, return: result.return_ })
}

// POST /admin/orders/:id/capture
export const capturePayment = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const { result } = await capturePaymentWorkflow(req.scope).run({
    input: {
      order_id: id,
      ...req.validatedBody,
    },
  })

  res.status(200).json({ order: result })
}

// POST /admin/orders/:id/refund
export const refundPayment = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const { result } = await refundPaymentWorkflow(req.scope).run({
    input: {
      order_id: id,
      ...req.validatedBody,
    },
  })

  res.status(200).json({ order: result })
}
