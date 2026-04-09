import { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import { MedusaError } from "@medusajs/utils"

// GET /store/orders - List authenticated customer's orders
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Customer authentication required to list orders"
    )
  }

  const query = req.scope.resolve("query")

  const { data: orders, metadata } = await query.graph({
    entity: "order",
    fields: req.remoteQueryConfig.fields,
    filters: {
      ...req.filterableFields,
      customer_id: customerId,
    },
    pagination: req.remoteQueryConfig.pagination,
  })

  res.status(200).json({
    orders,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  })
}

// GET /store/orders/:id - Get order details
export const getById = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Customer authentication required to view order"
    )
  }

  const query = req.scope.resolve("query")

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: req.remoteQueryConfig.fields,
    filters: {
      id,
      customer_id: customerId,
    },
  })

  if (!order) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order ${id} not found for customer ${customerId}`
    )
  }

  res.status(200).json({ order })
}
