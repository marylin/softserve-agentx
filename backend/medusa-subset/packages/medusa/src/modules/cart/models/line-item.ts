import {
  BeforeCreate,
  Entity,
  ManyToOne,
  OneToMany,
  OnInit,
  OptionalProps,
  PrimaryKey,
  Property,
} from "@mikro-orm/core"
import { DALUtils, generateEntityId } from "@medusajs/utils"

import Cart from "./cart"
import LineItemAdjustment from "./line-item-adjustment"
import LineItemTaxLine from "./line-item-tax-line"

@Entity({ tableName: "cart_line_item" })
@Filter(DALUtils.mikroOrmSoftDeletableFilterOptions)
export default class LineItem {
  [OptionalProps]?:
    | "created_at"
    | "updated_at"
    | "deleted_at"
    | "is_discountable"
    | "is_tax_inclusive"
    | "requires_shipping"

  @PrimaryKey({ columnType: "text" })
  id!: string

  @Property({ columnType: "text" })
  cart_id!: string

  @ManyToOne(() => Cart, {
    persist: false,
    fieldName: "cart_id",
  })
  cart!: Cart

  @Property({ columnType: "text" })
  title!: string

  @Property({ columnType: "text", nullable: true })
  subtitle: string | null = null

  @Property({ columnType: "text", nullable: true })
  thumbnail: string | null = null

  @Property({ columnType: "integer" })
  quantity!: number

  @Property({ columnType: "text", nullable: true })
  variant_id: string | null = null

  @Property({ columnType: "text", nullable: true })
  product_id: string | null = null

  @Property({ columnType: "text", nullable: true })
  product_title: string | null = null

  @Property({ columnType: "text", nullable: true })
  product_description: string | null = null

  @Property({ columnType: "text", nullable: true })
  product_subtitle: string | null = null

  @Property({ columnType: "text", nullable: true })
  product_type: string | null = null

  @Property({ columnType: "text", nullable: true })
  product_collection: string | null = null

  @Property({ columnType: "text", nullable: true })
  product_handle: string | null = null

  @Property({ columnType: "text", nullable: true })
  variant_sku: string | null = null

  @Property({ columnType: "text", nullable: true })
  variant_barcode: string | null = null

  @Property({ columnType: "text", nullable: true })
  variant_title: string | null = null

  @Property({ columnType: "integer" })
  unit_price!: number

  @Property({ columnType: "boolean", default: false })
  is_tax_inclusive: boolean = false

  @Property({ columnType: "boolean", default: true })
  is_discountable: boolean = true

  @Property({ columnType: "boolean", default: true })
  requires_shipping: boolean = true

  @OneToMany(() => LineItemAdjustment, (adj) => adj.item, {
    orphanRemoval: true,
  })
  adjustments = new Collection<LineItemAdjustment>(this)

  @OneToMany(() => LineItemTaxLine, (tl) => tl.item, {
    orphanRemoval: true,
  })
  tax_lines = new Collection<LineItemTaxLine>(this)

  @Property({ columnType: "jsonb", nullable: true })
  metadata: Record<string, unknown> | null = null

  @Property({ columnType: "timestamptz", nullable: false })
  created_at: Date = new Date()

  @Property({ columnType: "timestamptz", nullable: false })
  updated_at: Date = new Date()

  @Property({ columnType: "timestamptz", nullable: true })
  deleted_at: Date | null = null

  @BeforeCreate()
  onCreate() {
    this.id = generateEntityId(this.id, "cali")
  }

  @OnInit()
  onInit() {
    this.id = generateEntityId(this.id, "cali")
  }
}
