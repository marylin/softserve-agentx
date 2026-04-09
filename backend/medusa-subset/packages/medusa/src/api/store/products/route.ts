import { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import { MedusaError } from "@medusajs/utils"

// GET /store/products - List published products
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve("query")

  // Sales channel filtering via publishable API key
  const salesChannelIds = req.publishableApiKeyScopes?.sales_channel_ids ?? []

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: req.remoteQueryConfig.fields,
    filters: {
      ...req.filterableFields,
      status: "published",
      // Products must be in the request's sales channel
      sales_channel_id: salesChannelIds,
    },
    pagination: req.remoteQueryConfig.pagination,
  })

  // If pricing context is provided, resolve calculated prices
  if (req.pricingContext) {
    const pricingModule = req.scope.resolve("pricingModuleService")
    for (const product of products) {
      for (const variant of product.variants ?? []) {
        if (variant.price_set_id) {
          variant.calculated_price = await pricingModule.calculatePrices(
            { id: [variant.price_set_id] },
            { context: req.pricingContext }
          )
        }
      }
    }
  }

  res.status(200).json({
    products,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  })
}

// GET /store/products/:id - Get product details
export const getById = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const query = req.scope.resolve("query")
  const salesChannelIds = req.publishableApiKeyScopes?.sales_channel_ids ?? []

  const { data: [product] } = await query.graph({
    entity: "product",
    fields: req.remoteQueryConfig.fields,
    filters: {
      id,
      status: "published",
      sales_channel_id: salesChannelIds,
    },
  })

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product ${id} not found. Verify the product is published and in the correct sales channel.`
    )
  }

  // Resolve prices if pricing context provided
  if (req.pricingContext) {
    const pricingModule = req.scope.resolve("pricingModuleService")
    for (const variant of product.variants ?? []) {
      if (variant.price_set_id) {
        variant.calculated_price = await pricingModule.calculatePrices(
          { id: [variant.price_set_id] },
          { context: req.pricingContext }
        )
      }
    }
  }

  res.status(200).json({ product })
}
