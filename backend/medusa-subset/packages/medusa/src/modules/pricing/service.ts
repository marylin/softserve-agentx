import { PricingTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  priceSetRepository: DAL.RepositoryService
  moneyAmountRepository: DAL.RepositoryService
  priceListRepository: DAL.RepositoryService
  priceRuleRepository: DAL.RepositoryService
  pricePreferenceRepository: DAL.RepositoryService
}

export default class PricingModuleService {
  protected readonly priceSetRepository_: DAL.RepositoryService
  protected readonly moneyAmountRepository_: DAL.RepositoryService
  protected readonly priceListRepository_: DAL.RepositoryService
  protected readonly priceRuleRepository_: DAL.RepositoryService
  protected readonly pricePreferenceRepository_: DAL.RepositoryService

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.priceSetRepository_ = container.priceSetRepository
    this.moneyAmountRepository_ = container.moneyAmountRepository
    this.priceListRepository_ = container.priceListRepository
    this.priceRuleRepository_ = container.priceRuleRepository
    this.pricePreferenceRepository_ = container.pricePreferenceRepository
  }

  // ---- Price Calculation (core method) ----

  async calculatePrices(
    priceSetIds: { id: string[] },
    pricingContext: {
      context: {
        currency_code?: string
        region_id?: string
        customer_group_id?: string
        quantity?: number
      }
    }
  ): Promise<PricingTypes.CalculatedPriceSet[]> {
    const context = pricingContext.context
    const results: PricingTypes.CalculatedPriceSet[] = []

    for (const priceSetId of priceSetIds.id) {
      // Get all money amounts for this price set
      const moneyAmounts = await this.moneyAmountRepository_.find({
        where: { price_set_id: priceSetId },
        relations: ["price_rules"],
      })

      if (!moneyAmounts?.length) {
        results.push({
          id: priceSetId,
          is_calculated_price_price_list: false,
          calculated_amount: null,
          raw_calculated_amount: null,
          original_amount: null,
          raw_original_amount: null,
          currency_code: context.currency_code || null,
          calculated_price: null,
          original_price: null,
        })
        continue
      }

      // Filter by currency
      let candidates = moneyAmounts.filter(
        (ma) => !context.currency_code || ma.currency_code === context.currency_code
      )

      // Score candidates by specificity (more matching rules = higher priority)
      const scored = candidates.map((ma) => {
        let score = 0
        const rules = ma.price_rules || []

        for (const rule of rules) {
          if (rule.attribute === "region_id" && context.region_id === rule.value) {
            score += 10
          }
          if (rule.attribute === "customer_group_id" && context.customer_group_id === rule.value) {
            score += 5
          }
          if (rule.attribute === "currency_code" && context.currency_code === rule.value) {
            score += 1
          }
        }

        // Check quantity tiers
        if (context.quantity) {
          if (ma.min_quantity && context.quantity < ma.min_quantity) {
            return { ma, score: -1 } // Disqualified
          }
          if (ma.max_quantity && context.quantity > ma.max_quantity) {
            return { ma, score: -1 } // Disqualified
          }
        }

        return { ma, score }
      })

      // Find best match
      const validCandidates = scored.filter((s) => s.score >= 0)
      validCandidates.sort((a, b) => b.score - a.score)

      const bestMatch = validCandidates[0]?.ma

      // Check for active price list overrides
      let priceListAmount = null
      if (bestMatch) {
        const priceLists = await this.priceListRepository_.find({
          where: {
            status: "active",
            starts_at: { $lte: new Date() },
            $or: [
              { ends_at: null },
              { ends_at: { $gte: new Date() } },
            ],
          },
        })

        for (const priceList of priceLists ?? []) {
          const listPrices = await this.moneyAmountRepository_.find({
            where: {
              price_set_id: priceSetId,
              price_list_id: priceList.id,
              currency_code: context.currency_code,
            },
          })

          if (listPrices?.length) {
            priceListAmount = listPrices[0]
            break
          }
        }
      }

      const calculatedAmount = priceListAmount?.amount ?? bestMatch?.amount ?? null

      results.push({
        id: priceSetId,
        is_calculated_price_price_list: !!priceListAmount,
        calculated_amount: calculatedAmount,
        raw_calculated_amount: calculatedAmount,
        original_amount: bestMatch?.amount ?? null,
        raw_original_amount: bestMatch?.amount ?? null,
        currency_code: bestMatch?.currency_code ?? context.currency_code ?? null,
        calculated_price: {
          id: (priceListAmount ?? bestMatch)?.id ?? null,
          price_list_id: priceListAmount?.price_list_id ?? null,
          price_list_type: priceListAmount ? "sale" : null,
          min_quantity: (priceListAmount ?? bestMatch)?.min_quantity ?? null,
          max_quantity: (priceListAmount ?? bestMatch)?.max_quantity ?? null,
        },
        original_price: bestMatch ? {
          id: bestMatch.id,
          price_list_id: null,
          price_list_type: null,
          min_quantity: bestMatch.min_quantity ?? null,
          max_quantity: bestMatch.max_quantity ?? null,
        } : null,
      })
    }

    return results
  }

  // ---- Price Sets ----

  async createPriceSets(
    data: PricingTypes.CreatePriceSetDTO[],
    sharedContext?: Context
  ): Promise<PricingTypes.PriceSetDTO[]> {
    return await this.priceSetRepository_.create(data, sharedContext)
  }

  // ---- Price Lists ----

  async createPriceLists(
    data: PricingTypes.CreatePriceListDTO[],
    sharedContext?: Context
  ): Promise<PricingTypes.PriceListDTO[]> {
    for (const priceList of data) {
      if (priceList.starts_at && priceList.ends_at) {
        if (new Date(priceList.starts_at) >= new Date(priceList.ends_at)) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Price list starts_at must be before ends_at`
          )
        }
      }
    }

    return await this.priceListRepository_.create(data, sharedContext)
  }

  async updatePriceLists(
    data: PricingTypes.UpdatePriceListDTO[],
    sharedContext?: Context
  ): Promise<PricingTypes.PriceListDTO[]> {
    return await this.priceListRepository_.update(data, sharedContext)
  }

  async deletePriceLists(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.priceListRepository_.delete(ids, sharedContext)
  }

  // ---- Price Preferences ----

  async createPricePreferences(
    data: PricingTypes.CreatePricePreferenceDTO[],
    sharedContext?: Context
  ): Promise<PricingTypes.PricePreferenceDTO[]> {
    return await this.pricePreferenceRepository_.create(data, sharedContext)
  }
}
