import { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import { MedusaError } from "@medusajs/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  deleteProductsWorkflow,
} from "../../../workflows/product/workflows"

// GET /admin/products - List all products
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve("query")

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: req.remoteQueryConfig.fields,
    filters: req.filterableFields,
    pagination: req.remoteQueryConfig.pagination,
  })

  res.status(200).json({
    products,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  })
}

// POST /admin/products - Create a product
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { result } = await createProductsWorkflow(req.scope).run({
    input: {
      products: [req.validatedBody],
    },
  })

  res.status(200).json({ product: result[0] })
}

// GET /admin/products/:id - Get product details
export const getById = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const query = req.scope.resolve("query")

  const { data: [product] } = await query.graph({
    entity: "product",
    fields: req.remoteQueryConfig.fields,
    filters: { id },
  })

  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product ${id} not found`)
  }

  res.status(200).json({ product })
}

// POST /admin/products/:id - Update a product
export const update = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const { result } = await updateProductsWorkflow(req.scope).run({
    input: {
      products: [{ id, ...req.validatedBody }],
    },
  })

  res.status(200).json({ product: result[0] })
}

// DELETE /admin/products/:id - Delete a product
export const deleteProduct = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  await deleteProductsWorkflow(req.scope).run({
    input: { ids: [id] },
  })

  res.status(200).json({ id, object: "product", deleted: true })
}
