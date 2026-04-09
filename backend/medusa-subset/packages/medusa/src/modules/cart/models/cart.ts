import {
  BeforeCreate,
  Entity,
  Enum,
  Filter,
  ManyToOne,
  OneToMany,
  OnInit,
  OptionalProps,
  PrimaryKey,
  Property,
} from "@mikro-orm/core"
import { DALUtils, generateEntityId } from "@medusajs/utils"

import Address from "./address"
import LineItem from "./line-item"
import ShippingMethod from "./shipping-method"

@Entity({ tableName: "cart" })
@Filter(DALUtils.mikroOrmSoftDeletableFilterOptions)
export default class Cart {
  [OptionalProps]?:
    | "created_at"
    | "updated_at"
    | "deleted_at"

  @PrimaryKey({ columnType: "text" })
  id!: string

  @Property({ columnType: "text", nullable: true })
  region_id: string | null = null

  @Property({ columnType: "text", nullable: true })
  customer_id: string | null = null

  @Property({ columnType: "text", nullable: true })
  sales_channel_id: string | null = null

  @Property({ columnType: "text", nullable: true })
  email: string | null = null

  @Property({ columnType: "text" })
  currency_code!: string

  @ManyToOne(() => Address, {
    columnType: "text",
    fieldName: "shipping_address_id",
    nullable: true,
    mapToPk: true,
  })
  shipping_address_id: string | null = null

  @ManyToOne(() => Address, {
    columnType: "text",
    fieldName: "billing_address_id",
    nullable: true,
    mapToPk: true,
  })
  billing_address_id: string | null = null

  @ManyToOne(() => Address, { persist: false, nullable: true })
  shipping_address: Address | null = null

  @ManyToOne(() => Address, { persist: false, nullable: true })
  billing_address: Address | null = null

  @OneToMany(() => LineItem, (lineItem) => lineItem.cart, {
    orphanRemoval: true,
  })
  items = new Collection<LineItem>(this)

  @OneToMany(() => ShippingMethod, (sm) => sm.cart, {
    orphanRemoval: true,
  })
  shipping_methods = new Collection<ShippingMethod>(this)

  @Property({ columnType: "jsonb", nullable: true })
  metadata: Record<string, unknown> | null = null

  @Property({ columnType: "timestamptz", nullable: true })
  completed_at: Date | null = null

  @Property({ columnType: "timestamptz", nullable: false })
  created_at: Date = new Date()

  @Property({ columnType: "timestamptz", nullable: false })
  updated_at: Date = new Date()

  @Property({ columnType: "timestamptz", nullable: true })
  deleted_at: Date | null = null

  @BeforeCreate()
  onCreate() {
    this.id = generateEntityId(this.id, "cart")
  }

  @OnInit()
  onInit() {
    this.id = generateEntityId(this.id, "cart")
  }
}
