import {
  BeforeCreate,
  Entity,
  Enum,
  Filter,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OnInit,
  OptionalProps,
  PrimaryKey,
  Property,
} from "@mikro-orm/core"
import { DALUtils, generateEntityId, kebabCase } from "@medusajs/utils"

import ProductVariant from "./product-variant"
import ProductOption from "./product-option"
import ProductImage from "./product-image"
import ProductTag from "./product-tag"
import ProductType from "./product-type"
import ProductCollection from "./product-collection"
import ProductCategory from "./product-category"

@Entity({ tableName: "product" })
@Filter(DALUtils.mikroOrmSoftDeletableFilterOptions)
export default class Product {
  [OptionalProps]?:
    | "created_at"
    | "updated_at"
    | "deleted_at"
    | "status"
    | "discountable"

  @PrimaryKey({ columnType: "text" })
  id!: string

  @Property({ columnType: "text" })
  title!: string

  @Property({ columnType: "text", nullable: true })
  subtitle: string | null = null

  @Property({ columnType: "text", nullable: true })
  description: string | null = null

  @Property({ columnType: "text", unique: true, nullable: true })
  handle: string | null = null

  @Enum({
    items: () => ["draft", "published", "rejected", "proposed"],
    default: "draft",
  })
  status: string = "draft"

  @Property({ columnType: "text", nullable: true })
  thumbnail: string | null = null

  @Property({ columnType: "numeric", nullable: true })
  weight: number | null = null

  @Property({ columnType: "numeric", nullable: true })
  length: number | null = null

  @Property({ columnType: "numeric", nullable: true })
  height: number | null = null

  @Property({ columnType: "numeric", nullable: true })
  width: number | null = null

  @Property({ columnType: "text", nullable: true })
  hs_code: string | null = null

  @Property({ columnType: "text", nullable: true })
  origin_country: string | null = null

  @Property({ columnType: "text", nullable: true })
  mid_code: string | null = null

  @Property({ columnType: "text", nullable: true })
  material: string | null = null

  @Property({ columnType: "boolean", default: false })
  is_giftcard: boolean = false

  @Property({ columnType: "boolean", default: true })
  discountable: boolean = true

  @Property({ columnType: "text", nullable: true })
  collection_id: string | null = null

  @Property({ columnType: "text", nullable: true })
  type_id: string | null = null

  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    orphanRemoval: true,
  })
  variants = new Collection<ProductVariant>(this)

  @OneToMany(() => ProductOption, (option) => option.product, {
    orphanRemoval: true,
  })
  options = new Collection<ProductOption>(this)

  @OneToMany(() => ProductImage, (image) => image.product, {
    orphanRemoval: true,
  })
  images = new Collection<ProductImage>(this)

  @ManyToMany(() => ProductTag)
  tags = new Collection<ProductTag>(this)

  @ManyToMany(() => ProductCategory)
  categories = new Collection<ProductCategory>(this)

  @ManyToOne(() => ProductCollection, {
    nullable: true,
    fieldName: "collection_id",
  })
  collection: ProductCollection | null = null

  @ManyToOne(() => ProductType, {
    nullable: true,
    fieldName: "type_id",
  })
  type: ProductType | null = null

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
    this.id = generateEntityId(this.id, "prod")
    if (!this.handle && this.title) {
      this.handle = kebabCase(this.title)
    }
  }

  @OnInit()
  onInit() {
    this.id = generateEntityId(this.id, "prod")
  }
}
