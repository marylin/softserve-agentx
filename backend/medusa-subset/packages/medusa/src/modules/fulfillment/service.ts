import { FulfillmentTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  fulfillmentRepository: DAL.RepositoryService
  shippingOptionRepository: DAL.RepositoryService
  shippingProfileRepository: DAL.RepositoryService
  serviceZoneRepository: DAL.RepositoryService
  geoZoneRepository: DAL.RepositoryService
  fulfillmentSetRepository: DAL.RepositoryService
  fulfillmentProviderService: any
}

export default class FulfillmentModuleService {
  protected readonly fulfillmentRepository_: DAL.RepositoryService
  protected readonly shippingOptionRepository_: DAL.RepositoryService
  protected readonly shippingProfileRepository_: DAL.RepositoryService
  protected readonly serviceZoneRepository_: DAL.RepositoryService
  protected readonly geoZoneRepository_: DAL.RepositoryService
  protected readonly fulfillmentProviderService_: any

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.fulfillmentRepository_ = container.fulfillmentRepository
    this.shippingOptionRepository_ = container.shippingOptionRepository
    this.shippingProfileRepository_ = container.shippingProfileRepository
    this.serviceZoneRepository_ = container.serviceZoneRepository
    this.geoZoneRepository_ = container.geoZoneRepository
    this.fulfillmentProviderService_ = container.fulfillmentProviderService
  }

  // ---- Fulfillment CRUD ----

  async createFulfillment(
    data: FulfillmentTypes.CreateFulfillmentDTO,
    sharedContext?: Context
  ): Promise<FulfillmentTypes.FulfillmentDTO> {
    const fulfillments = await this.fulfillmentRepository_.create(
      [data],
      sharedContext
    )
    return fulfillments[0]
  }

  async cancelFulfillment(
    id: string,
    sharedContext?: Context
  ): Promise<FulfillmentTypes.FulfillmentDTO> {
    const fulfillments = await this.fulfillmentRepository_.find(
      { where: { id } },
      sharedContext
    )

    if (!fulfillments?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Fulfillment ${id} not found`
      )
    }

    const fulfillment = fulfillments[0]

    if (fulfillment.shipped_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot cancel a shipped fulfillment. Process as a return instead.`
      )
    }

    // Cancel with provider if applicable
    if (fulfillment.provider_id) {
      try {
        await this.fulfillmentProviderService_.cancelFulfillment(
          fulfillment.provider_id,
          fulfillment.data
        )
      } catch (error) {
        // Log but don't block cancellation
        console.error(`Provider cancel failed for fulfillment ${id}:`, error.message)
      }
    }

    const updated = await this.fulfillmentRepository_.update(
      [{ id, canceled_at: new Date() }],
      sharedContext
    )

    return updated[0]
  }

  async createShipment(
    fulfillmentId: string,
    trackingNumbers: string[],
    data?: Record<string, unknown>,
    sharedContext?: Context
  ): Promise<FulfillmentTypes.FulfillmentDTO> {
    const fulfillments = await this.fulfillmentRepository_.find(
      { where: { id: fulfillmentId } },
      sharedContext
    )

    if (!fulfillments?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Fulfillment ${fulfillmentId} not found`
      )
    }

    if (fulfillments[0].canceled_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot ship a canceled fulfillment`
      )
    }

    const updated = await this.fulfillmentRepository_.update(
      [{
        id: fulfillmentId,
        shipped_at: new Date(),
        data: {
          ...fulfillments[0].data,
          tracking_numbers: trackingNumbers,
          ...data,
        },
      }],
      sharedContext
    )

    return updated[0]
  }

  // ---- Shipping Options ----

  async listShippingOptions(
    filters?: FulfillmentTypes.FilterableShippingOptionProps,
    config?: FulfillmentTypes.FindConfig<FulfillmentTypes.ShippingOptionDTO>,
    sharedContext?: Context
  ): Promise<FulfillmentTypes.ShippingOptionDTO[]> {
    return await this.shippingOptionRepository_.find(filters, sharedContext)
  }

  async listShippingOptionsForContext(
    context: {
      address?: { country_code: string; province_code?: string; city?: string; postal_code?: string }
      currency_code?: string
      cart_total?: number
      cart_weight?: number
    },
    sharedContext?: Context
  ): Promise<FulfillmentTypes.ShippingOptionDTO[]> {
    if (!context.address?.country_code) {
      return []
    }

    // Find matching geo zones
    const geoZones = await this.geoZoneRepository_.find(
      {
        where: {
          country_code: context.address.country_code,
          // Also match by province, city, postal code if provided
        },
      },
      sharedContext
    )

    if (!geoZones?.length) {
      return []
    }

    // Get service zones for matching geo zones
    const serviceZoneIds = [...new Set(geoZones.map((gz) => gz.service_zone_id))]

    // Get shipping options for those service zones
    const options = await this.shippingOptionRepository_.find(
      {
        where: {
          service_zone_id: { $in: serviceZoneIds },
        },
        relations: ["rules"],
      },
      sharedContext
    )

    // Filter by rules (min/max cart total, weight, etc.)
    return options.filter((option) => {
      if (!option.rules?.length) return true

      return option.rules.every((rule) => {
        switch (rule.attribute) {
          case "cart_total":
            if (context.cart_total === undefined) return true
            if (rule.operator === "gte") return context.cart_total >= rule.value
            if (rule.operator === "lte") return context.cart_total <= rule.value
            return true
          case "cart_weight":
            if (context.cart_weight === undefined) return true
            if (rule.operator === "gte") return context.cart_weight >= rule.value
            if (rule.operator === "lte") return context.cart_weight <= rule.value
            return true
          default:
            return true
        }
      })
    })
  }

  // ---- Shipping Profiles ----

  async createShippingProfiles(
    data: FulfillmentTypes.CreateShippingProfileDTO[],
    sharedContext?: Context
  ): Promise<FulfillmentTypes.ShippingProfileDTO[]> {
    return await this.shippingProfileRepository_.create(data, sharedContext)
  }

  async listShippingProfiles(
    filters?: FulfillmentTypes.FilterableShippingProfileProps,
    config?: FulfillmentTypes.FindConfig<FulfillmentTypes.ShippingProfileDTO>,
    sharedContext?: Context
  ): Promise<FulfillmentTypes.ShippingProfileDTO[]> {
    return await this.shippingProfileRepository_.find(filters, sharedContext)
  }

  // ---- Service Zones & Geo Zones ----

  async createServiceZones(
    data: FulfillmentTypes.CreateServiceZoneDTO[],
    sharedContext?: Context
  ): Promise<FulfillmentTypes.ServiceZoneDTO[]> {
    return await this.serviceZoneRepository_.create(data, sharedContext)
  }

  async createGeoZones(
    data: FulfillmentTypes.CreateGeoZoneDTO[],
    sharedContext?: Context
  ): Promise<FulfillmentTypes.GeoZoneDTO[]> {
    return await this.geoZoneRepository_.create(data, sharedContext)
  }
}
