import { CustomerTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"

type InjectedDependencies = {
  customerRepository: DAL.RepositoryService
  customerAddressRepository: DAL.RepositoryService
  customerGroupRepository: DAL.RepositoryService
  customerGroupCustomerRepository: DAL.RepositoryService
}

export default class CustomerModuleService {
  protected readonly customerRepository_: DAL.RepositoryService
  protected readonly customerAddressRepository_: DAL.RepositoryService
  protected readonly customerGroupRepository_: DAL.RepositoryService

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.customerRepository_ = container.customerRepository
    this.customerAddressRepository_ = container.customerAddressRepository
    this.customerGroupRepository_ = container.customerGroupRepository
  }

  // ---- Customer CRUD ----

  async createCustomers(
    data: CustomerTypes.CreateCustomerDTO[],
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerDTO[]> {
    for (const customer of data) {
      if (customer.email && customer.has_account) {
        const existing = await this.customerRepository_.find(
          { where: { email: customer.email, has_account: true } },
          sharedContext
        )
        if (existing?.length) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Customer with email ${customer.email} already has an account`
          )
        }
      }
    }

    return await this.customerRepository_.create(data, sharedContext)
  }

  async updateCustomers(
    data: CustomerTypes.UpdateCustomerDTO[],
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerDTO[]> {
    return await this.customerRepository_.update(data, sharedContext)
  }

  async deleteCustomers(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.customerRepository_.delete(ids, sharedContext)
  }

  async retrieveCustomer(
    customerId: string,
    config?: CustomerTypes.FindConfig<CustomerTypes.CustomerDTO>,
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerDTO> {
    const customers = await this.customerRepository_.find(
      { where: { id: customerId } },
      sharedContext
    )

    if (!customers?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Customer with id: ${customerId} was not found`
      )
    }

    return customers[0]
  }

  async listCustomers(
    filters?: CustomerTypes.FilterableCustomerProps,
    config?: CustomerTypes.FindConfig<CustomerTypes.CustomerDTO>,
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerDTO[]> {
    return await this.customerRepository_.find(filters, sharedContext)
  }

  async listAndCountCustomers(
    filters?: CustomerTypes.FilterableCustomerProps,
    config?: CustomerTypes.FindConfig<CustomerTypes.CustomerDTO>,
    sharedContext?: Context
  ): Promise<[CustomerTypes.CustomerDTO[], number]> {
    return await this.customerRepository_.findAndCount(filters, sharedContext)
  }

  // ---- Addresses ----

  async createAddresses(
    data: CustomerTypes.CreateCustomerAddressDTO[],
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerAddressDTO[]> {
    return await this.customerAddressRepository_.create(data, sharedContext)
  }

  async updateAddresses(
    data: CustomerTypes.UpdateCustomerAddressDTO[],
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerAddressDTO[]> {
    return await this.customerAddressRepository_.update(data, sharedContext)
  }

  async deleteAddresses(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.customerAddressRepository_.delete(ids, sharedContext)
  }

  async listAddresses(
    filters?: CustomerTypes.FilterableCustomerAddressProps,
    config?: CustomerTypes.FindConfig<CustomerTypes.CustomerAddressDTO>,
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerAddressDTO[]> {
    return await this.customerAddressRepository_.find(filters, sharedContext)
  }

  // ---- Customer Groups ----

  async createCustomerGroups(
    data: CustomerTypes.CreateCustomerGroupDTO[],
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerGroupDTO[]> {
    for (const group of data) {
      const existing = await this.customerGroupRepository_.find(
        { where: { name: group.name } },
        sharedContext
      )
      if (existing?.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Customer group with name "${group.name}" already exists`
        )
      }
    }

    return await this.customerGroupRepository_.create(data, sharedContext)
  }

  async updateCustomerGroups(
    data: CustomerTypes.UpdateCustomerGroupDTO[],
    sharedContext?: Context
  ): Promise<CustomerTypes.CustomerGroupDTO[]> {
    return await this.customerGroupRepository_.update(data, sharedContext)
  }

  async deleteCustomerGroups(
    ids: string[],
    sharedContext?: Context
  ): Promise<void> {
    await this.customerGroupRepository_.delete(ids, sharedContext)
  }

  async addCustomerToGroup(
    groupId: string,
    customerIds: string[],
    sharedContext?: Context
  ): Promise<void> {
    const group = await this.customerGroupRepository_.find(
      { where: { id: groupId } },
      sharedContext
    )

    if (!group?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Customer group ${groupId} not found`
      )
    }

    // Verify all customers exist
    for (const customerId of customerIds) {
      await this.retrieveCustomer(customerId, {}, sharedContext)
    }

    // Add to group (link table)
    // Implementation via link module
  }

  async removeCustomerFromGroup(
    groupId: string,
    customerIds: string[],
    sharedContext?: Context
  ): Promise<void> {
    // Remove from group (link table)
    // Implementation via link module
  }
}
