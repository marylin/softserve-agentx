import { InventoryTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  inventoryItemRepository: DAL.RepositoryService
  inventoryLevelRepository: DAL.RepositoryService
  reservationItemRepository: DAL.RepositoryService
}

export default class InventoryModuleService {
  protected readonly inventoryItemRepository_: DAL.RepositoryService
  protected readonly inventoryLevelRepository_: DAL.RepositoryService
  protected readonly reservationItemRepository_: DAL.RepositoryService

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.inventoryItemRepository_ = container.inventoryItemRepository
    this.inventoryLevelRepository_ = container.inventoryLevelRepository
    this.reservationItemRepository_ = container.reservationItemRepository
  }

  // ---- Inventory Items ----

  async createInventoryItems(
    data: InventoryTypes.CreateInventoryItemInput[],
    sharedContext?: Context
  ): Promise<InventoryTypes.InventoryItemDTO[]> {
    return await this.inventoryItemRepository_.create(data, sharedContext)
  }

  async updateInventoryItems(
    data: InventoryTypes.UpdateInventoryItemInput[],
    sharedContext?: Context
  ): Promise<InventoryTypes.InventoryItemDTO[]> {
    return await this.inventoryItemRepository_.update(data, sharedContext)
  }

  async deleteInventoryItems(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.inventoryItemRepository_.delete(ids, sharedContext)
  }

  async retrieveInventoryItem(
    inventoryItemId: string,
    config?: InventoryTypes.FindConfig<InventoryTypes.InventoryItemDTO>,
    sharedContext?: Context
  ): Promise<InventoryTypes.InventoryItemDTO> {
    const items = await this.inventoryItemRepository_.find(
      { where: { id: inventoryItemId } },
      sharedContext
    )

    if (!items?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Inventory item with id: ${inventoryItemId} was not found`
      )
    }

    return items[0]
  }

  // ---- Inventory Levels ----

  async createInventoryLevels(
    data: InventoryTypes.CreateInventoryLevelInput[],
    sharedContext?: Context
  ): Promise<InventoryTypes.InventoryLevelDTO[]> {
    // Validate no duplicates (item + location)
    for (const level of data) {
      const existing = await this.inventoryLevelRepository_.find(
        {
          where: {
            inventory_item_id: level.inventory_item_id,
            location_id: level.location_id,
          },
        },
        sharedContext
      )

      if (existing?.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Inventory level already exists for item ${level.inventory_item_id} at location ${level.location_id}`
        )
      }
    }

    return await this.inventoryLevelRepository_.create(data, sharedContext)
  }

  async updateInventoryLevels(
    data: InventoryTypes.UpdateInventoryLevelInput[],
    sharedContext?: Context
  ): Promise<InventoryTypes.InventoryLevelDTO[]> {
    return await this.inventoryLevelRepository_.update(data, sharedContext)
  }

  async deleteInventoryLevels(
    inventoryItemId: string,
    locationId: string,
    sharedContext?: Context
  ): Promise<void> {
    const levels = await this.inventoryLevelRepository_.find(
      {
        where: {
          inventory_item_id: inventoryItemId,
          location_id: locationId,
        },
      },
      sharedContext
    )

    if (levels?.length) {
      await this.inventoryLevelRepository_.delete(
        levels.map((l) => l.id),
        sharedContext
      )
    }
  }

  // ---- Available Quantity Calculation ----

  async retrieveAvailableQuantity(
    inventoryItemId: string,
    locationIds: string[],
    sharedContext?: Context
  ): Promise<number> {
    const levels = await this.inventoryLevelRepository_.find(
      {
        where: {
          inventory_item_id: inventoryItemId,
          location_id: { $in: locationIds },
        },
      },
      sharedContext
    )

    return levels.reduce((total, level) => {
      const available = level.stocked_quantity - level.reserved_quantity
      return total + Math.max(0, available)
    }, 0)
  }

  async confirmInventory(
    inventoryItemId: string,
    locationIds: string[],
    quantity: number,
    sharedContext?: Context
  ): Promise<boolean> {
    const available = await this.retrieveAvailableQuantity(
      inventoryItemId,
      locationIds,
      sharedContext
    )
    return available >= quantity
  }

  // ---- Inventory Adjustments ----

  async adjustInventory(
    inventoryItemId: string,
    locationId: string,
    adjustment: number,
    sharedContext?: Context
  ): Promise<InventoryTypes.InventoryLevelDTO> {
    const levels = await this.inventoryLevelRepository_.find(
      {
        where: {
          inventory_item_id: inventoryItemId,
          location_id: locationId,
        },
      },
      sharedContext
    )

    if (!levels?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Inventory level not found for item ${inventoryItemId} at location ${locationId}`
      )
    }

    const level = levels[0]
    const newQuantity = level.stocked_quantity + adjustment

    if (newQuantity < 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Adjustment would result in negative stock (${newQuantity}) for item ${inventoryItemId} at location ${locationId}`
      )
    }

    const updated = await this.inventoryLevelRepository_.update(
      [{ id: level.id, stocked_quantity: newQuantity }],
      sharedContext
    )

    return updated[0]
  }

  // ---- Reservations ----

  async createReservationItems(
    data: InventoryTypes.CreateReservationItemInput[],
    sharedContext?: Context
  ): Promise<InventoryTypes.ReservationItemDTO[]> {
    // Validate available quantity for each reservation
    for (const reservation of data) {
      const available = await this.retrieveAvailableQuantity(
        reservation.inventory_item_id,
        [reservation.location_id],
        sharedContext
      )

      if (available < reservation.quantity) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Insufficient inventory for reservation. Available: ${available}, Requested: ${reservation.quantity}`
        )
      }
    }

    const reservations = await this.reservationItemRepository_.create(
      data,
      sharedContext
    )

    // Update reserved_quantity on inventory levels
    for (const reservation of data) {
      const levels = await this.inventoryLevelRepository_.find(
        {
          where: {
            inventory_item_id: reservation.inventory_item_id,
            location_id: reservation.location_id,
          },
        },
        sharedContext
      )

      if (levels?.length) {
        await this.inventoryLevelRepository_.update(
          [{
            id: levels[0].id,
            reserved_quantity: levels[0].reserved_quantity + reservation.quantity,
          }],
          sharedContext
        )
      }
    }

    return reservations
  }

  async deleteReservationItems(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    // Get reservations before deleting to update levels
    const reservations = await this.reservationItemRepository_.find(
      { where: { id: { $in: ids } } },
      sharedContext
    )

    await this.reservationItemRepository_.delete(ids, sharedContext)

    // Reduce reserved_quantity on inventory levels
    for (const reservation of reservations) {
      const levels = await this.inventoryLevelRepository_.find(
        {
          where: {
            inventory_item_id: reservation.inventory_item_id,
            location_id: reservation.location_id,
          },
        },
        sharedContext
      )

      if (levels?.length) {
        await this.inventoryLevelRepository_.update(
          [{
            id: levels[0].id,
            reserved_quantity: Math.max(
              0,
              levels[0].reserved_quantity - reservation.quantity
            ),
          }],
          sharedContext
        )
      }
    }
  }

  async listReservationItems(
    filters?: InventoryTypes.FilterableReservationItemProps,
    config?: InventoryTypes.FindConfig<InventoryTypes.ReservationItemDTO>,
    sharedContext?: Context
  ): Promise<InventoryTypes.ReservationItemDTO[]> {
    return await this.reservationItemRepository_.find(filters, sharedContext)
  }
}
