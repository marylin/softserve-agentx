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

@Entity({ tableName: "order" })
@Filter(DALUtils.mikroOrmSoftDeletableFilterOptions)
export default class Order {
  [OptionalProps]?:
    | "created_at"
    | "updated_at"
    | "deleted_at"
    | "status"
    | "fulfillment_status"
    | "payment_status"
    | "display_id"

  @PrimaryKey({ columnType: "text" })
  id!: string

  @Property({ columnType: "integer", autoincrement: true })
  display_id!: number

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

  @Property({ columnType: "text", nullable: true })
  shipping_address_id: string | null = null

  @Property({ columnType: "text", nullable: true })
  billing_address_id: string | null = null

  @Enum({
    items: () => ["pending", "completed", "canceled", "archived", "requires_action"],
    default: "pending",
  })
  status: string = "pending"

  @Enum({
    items: () => [
      "not_fulfilled",
      "partially_fulfilled",
      "fulfilled",
      "partially_shipped",
      "shipped",
      "partially_returned",
      "returned",
      "canceled",
    ],
    default: "not_fulfilled",
  })
  fulfillment_status: string = "not_fulfilled"

  @Enum({
    items: () => [
      "not_paid",
      "awaiting",
      "captured",
      "partially_captured",
      "partially_refunded",
      "refunded",
      "canceled",
      "requires_action",
    ],
    default: "not_paid",
  })
  payment_status: string = "not_paid"

  @Property({ columnType: "jsonb", nullable: true })
  metadata: Record<string, unknown> | null = null

  @Property({ columnType: "timestamptz", nullable: true })
  canceled_at: Date | null = null

  @Property({ columnType: "timestamptz", nullable: false })
  created_at: Date = new Date()

  @Property({ columnType: "timestamptz", nullable: false })
  updated_at: Date = new Date()

  @Property({ columnType: "timestamptz", nullable: true })
  deleted_at: Date | null = null

  @BeforeCreate()
  onCreate() {
    this.id = generateEntityId(this.id, "order")
  }

  @OnInit()
  onInit() {
    this.id = generateEntityId(this.id, "order")
  }
}
