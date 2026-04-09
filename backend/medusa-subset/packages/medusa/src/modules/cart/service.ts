import { CartTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { ModulesSdkUtils, MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  cartRepository: DAL.RepositoryService
  lineItemRepository: DAL.RepositoryService
  shippingMethodRepository: DAL.RepositoryService
  addressRepository: DAL.RepositoryService
}

export default class CartModuleService {
  protected readonly cartRepository_: DAL.RepositoryService
  protected readonly lineItemRepository_: DAL.RepositoryService
  protected readonly shippingMethodRepository_: DAL.RepositoryService
  protected readonly addressRepository_: DAL.RepositoryService

  constructor(
    { cartRepository, lineItemRepository, shippingMethodRepository, addressRepository }: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.cartRepository_ = cartRepository
    this.lineItemRepository_ = lineItemRepository
    this.shippingMethodRepository_ = shippingMethodRepository
    this.addressRepository_ = addressRepository
  }

  // ---- Cart CRUD ----

  async createCarts(
    data: CartTypes.CreateCartDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.CartDTO[]> {
    const carts = await this.cartRepository_.create(data, sharedContext)
    return carts
  }

  async updateCarts(
    data: CartTypes.UpdateCartDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.CartDTO[]> {
    const carts = await this.cartRepository_.update(data, sharedContext)
    return carts
  }

  async deleteCarts(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.cartRepository_.delete(ids, sharedContext)
  }

  async retrieveCart(
    cartId: string,
    config?: CartTypes.FindConfig<CartTypes.CartDTO>,
    sharedContext?: Context
  ): Promise<CartTypes.CartDTO> {
    const cart = await this.cartRepository_.find(
      { where: { id: cartId } },
      sharedContext
    )

    if (!cart?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart with id: ${cartId} was not found`
      )
    }

    return cart[0]
  }

  async listCarts(
    filters?: CartTypes.FilterableCartProps,
    config?: CartTypes.FindConfig<CartTypes.CartDTO>,
    sharedContext?: Context
  ): Promise<CartTypes.CartDTO[]> {
    return await this.cartRepository_.find(filters, sharedContext)
  }

  async listAndCountCarts(
    filters?: CartTypes.FilterableCartProps,
    config?: CartTypes.FindConfig<CartTypes.CartDTO>,
    sharedContext?: Context
  ): Promise<[CartTypes.CartDTO[], number]> {
    return await this.cartRepository_.findAndCount(filters, sharedContext)
  }

  // ---- Line Items ----

  async addLineItems(
    cartId: string,
    items: CartTypes.CreateLineItemDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.LineItemDTO[]> {
    const cart = await this.retrieveCart(cartId, {}, sharedContext)

    if (cart.completed_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot add items to a completed cart`
      )
    }

    const lineItems = items.map((item) => ({
      ...item,
      cart_id: cartId,
    }))

    return await this.lineItemRepository_.create(lineItems, sharedContext)
  }

  async updateLineItems(
    data: CartTypes.UpdateLineItemDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.LineItemDTO[]> {
    return await this.lineItemRepository_.update(data, sharedContext)
  }

  async removeLineItems(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.lineItemRepository_.delete(ids, sharedContext)
  }

  // ---- Shipping Methods ----

  async addShippingMethods(
    cartId: string,
    methods: CartTypes.CreateShippingMethodDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.ShippingMethodDTO[]> {
    const cart = await this.retrieveCart(cartId, {}, sharedContext)

    if (cart.completed_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot add shipping methods to a completed cart`
      )
    }

    const shippingMethods = methods.map((method) => ({
      ...method,
      cart_id: cartId,
    }))

    return await this.shippingMethodRepository_.create(shippingMethods, sharedContext)
  }

  async removeShippingMethods(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.shippingMethodRepository_.delete(ids, sharedContext)
  }

  // ---- Addresses ----

  async createAddresses(
    data: CartTypes.CreateAddressDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.AddressDTO[]> {
    return await this.addressRepository_.create(data, sharedContext)
  }

  async updateAddresses(
    data: CartTypes.UpdateAddressDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.AddressDTO[]> {
    return await this.addressRepository_.update(data, sharedContext)
  }

  // ---- Adjustments ----

  async setLineItemAdjustments(
    cartId: string,
    adjustments: CartTypes.CreateLineItemAdjustmentDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.LineItemAdjustmentDTO[]> {
    // Remove existing adjustments for the cart, then create new ones
    // This is used when promotions are applied/removed
    const cart = await this.retrieveCart(cartId, { relations: ["items.adjustments"] }, sharedContext)

    const existingAdjustmentIds = cart.items?.flatMap(
      (item) => item.adjustments?.map((adj) => adj.id) ?? []
    ) ?? []

    if (existingAdjustmentIds.length) {
      await this.lineItemRepository_.delete(existingAdjustmentIds, sharedContext)
    }

    return adjustments as CartTypes.LineItemAdjustmentDTO[]
  }

  async setShippingMethodAdjustments(
    cartId: string,
    adjustments: CartTypes.CreateShippingMethodAdjustmentDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.ShippingMethodAdjustmentDTO[]> {
    return adjustments as CartTypes.ShippingMethodAdjustmentDTO[]
  }

  // ---- Tax Lines ----

  async setLineItemTaxLines(
    cartId: string,
    taxLines: CartTypes.CreateLineItemTaxLineDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.LineItemTaxLineDTO[]> {
    return taxLines as CartTypes.LineItemTaxLineDTO[]
  }

  async setShippingMethodTaxLines(
    cartId: string,
    taxLines: CartTypes.CreateShippingMethodTaxLineDTO[],
    sharedContext?: Context
  ): Promise<CartTypes.ShippingMethodTaxLineDTO[]> {
    return taxLines as CartTypes.ShippingMethodTaxLineDTO[]
  }
}
