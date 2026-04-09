import { ProductTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  productRepository: DAL.RepositoryService
  productVariantRepository: DAL.RepositoryService
  productOptionRepository: DAL.RepositoryService
  productCategoryRepository: DAL.RepositoryService
  productCollectionRepository: DAL.RepositoryService
  productTagRepository: DAL.RepositoryService
  productTypeRepository: DAL.RepositoryService
  productImageRepository: DAL.RepositoryService
}

export default class ProductModuleService {
  protected readonly productRepository_: DAL.RepositoryService
  protected readonly productVariantRepository_: DAL.RepositoryService
  protected readonly productCategoryRepository_: DAL.RepositoryService
  protected readonly productCollectionRepository_: DAL.RepositoryService

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.productRepository_ = container.productRepository
    this.productVariantRepository_ = container.productVariantRepository
    this.productCategoryRepository_ = container.productCategoryRepository
    this.productCollectionRepository_ = container.productCollectionRepository
  }

  // ---- Product CRUD ----

  async createProducts(
    data: ProductTypes.CreateProductDTO[],
    sharedContext?: Context
  ): Promise<ProductTypes.ProductDTO[]> {
    // Validate unique handles
    for (const product of data) {
      if (product.handle) {
        const existing = await this.productRepository_.find(
          { where: { handle: product.handle } },
          sharedContext
        )
        if (existing?.length) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Product with handle "${product.handle}" already exists`
          )
        }
      }
    }

    return await this.productRepository_.create(data, sharedContext)
  }

  async updateProducts(
    data: ProductTypes.UpdateProductDTO[],
    sharedContext?: Context
  ): Promise<ProductTypes.ProductDTO[]> {
    return await this.productRepository_.update(data, sharedContext)
  }

  async deleteProducts(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.productRepository_.delete(ids, sharedContext)
  }

  async retrieveProduct(
    productId: string,
    config?: ProductTypes.FindConfig<ProductTypes.ProductDTO>,
    sharedContext?: Context
  ): Promise<ProductTypes.ProductDTO> {
    const products = await this.productRepository_.find(
      { where: { id: productId } },
      sharedContext
    )

    if (!products?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Product with id: ${productId} was not found`
      )
    }

    return products[0]
  }

  async listProducts(
    filters?: ProductTypes.FilterableProductProps,
    config?: ProductTypes.FindConfig<ProductTypes.ProductDTO>,
    sharedContext?: Context
  ): Promise<ProductTypes.ProductDTO[]> {
    return await this.productRepository_.find(filters, sharedContext)
  }

  async listAndCountProducts(
    filters?: ProductTypes.FilterableProductProps,
    config?: ProductTypes.FindConfig<ProductTypes.ProductDTO>,
    sharedContext?: Context
  ): Promise<[ProductTypes.ProductDTO[], number]> {
    return await this.productRepository_.findAndCount(filters, sharedContext)
  }

  // ---- Variants ----

  async createProductVariants(
    data: ProductTypes.CreateProductVariantDTO[],
    sharedContext?: Context
  ): Promise<ProductTypes.ProductVariantDTO[]> {
    // Validate unique SKUs
    for (const variant of data) {
      if (variant.sku) {
        const existing = await this.productVariantRepository_.find(
          { where: { sku: variant.sku } },
          sharedContext
        )
        if (existing?.length) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Variant with SKU "${variant.sku}" already exists`
          )
        }
      }
    }

    return await this.productVariantRepository_.create(data, sharedContext)
  }

  async updateProductVariants(
    data: ProductTypes.UpdateProductVariantDTO[],
    sharedContext?: Context
  ): Promise<ProductTypes.ProductVariantDTO[]> {
    return await this.productVariantRepository_.update(data, sharedContext)
  }

  async deleteProductVariants(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.productVariantRepository_.delete(ids, sharedContext)
  }

  // ---- Categories ----

  async createProductCategories(
    data: ProductTypes.CreateProductCategoryDTO[],
    sharedContext?: Context
  ): Promise<ProductTypes.ProductCategoryDTO[]> {
    // Validate no circular references
    for (const category of data) {
      if (category.parent_category_id) {
        await this.validateCategoryHierarchy(
          category.parent_category_id,
          sharedContext
        )
      }
    }

    return await this.productCategoryRepository_.create(data, sharedContext)
  }

  async listProductCategories(
    filters?: ProductTypes.FilterableProductCategoryProps,
    config?: ProductTypes.FindConfig<ProductTypes.ProductCategoryDTO>,
    sharedContext?: Context
  ): Promise<ProductTypes.ProductCategoryDTO[]> {
    return await this.productCategoryRepository_.find(filters, sharedContext)
  }

  private async validateCategoryHierarchy(
    parentId: string,
    sharedContext?: Context,
    visited: Set<string> = new Set()
  ): Promise<void> {
    if (visited.has(parentId)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Circular reference detected in category hierarchy`
      )
    }
    visited.add(parentId)

    const parent = await this.productCategoryRepository_.find(
      { where: { id: parentId } },
      sharedContext
    )
    if (parent?.[0]?.parent_category_id) {
      await this.validateCategoryHierarchy(
        parent[0].parent_category_id,
        sharedContext,
        visited
      )
    }
  }

  // ---- Collections ----

  async createProductCollections(
    data: ProductTypes.CreateProductCollectionDTO[],
    sharedContext?: Context
  ): Promise<ProductTypes.ProductCollectionDTO[]> {
    return await this.productCollectionRepository_.create(data, sharedContext)
  }

  async updateProductCollections(
    data: ProductTypes.UpdateProductCollectionDTO[],
    sharedContext?: Context
  ): Promise<ProductTypes.ProductCollectionDTO[]> {
    return await this.productCollectionRepository_.update(data, sharedContext)
  }
}
