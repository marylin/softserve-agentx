import { AuthTypes, Context, DAL, InternalModuleDeclaration } from "@medusajs/types"
import { MedusaError } from "@medusajs/utils"
import jwt from "jsonwebtoken"

type InjectedDependencies = {
  authIdentityRepository: DAL.RepositoryService
  providerIdentityRepository: DAL.RepositoryService
  authProviders: Map<string, any>
}

type AuthConfig = {
  jwtSecret: string
  jwtExpiresIn: string
  refreshTokenExpiresIn: string
}

export default class AuthModuleService {
  protected readonly authIdentityRepository_: DAL.RepositoryService
  protected readonly providerIdentityRepository_: DAL.RepositoryService
  protected readonly authProviders_: Map<string, any>
  protected readonly config_: AuthConfig

  constructor(
    container: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    this.authIdentityRepository_ = container.authIdentityRepository
    this.providerIdentityRepository_ = container.providerIdentityRepository
    this.authProviders_ = container.authProviders

    this.config_ = {
      jwtSecret: process.env.JWT_SECRET || "",
      jwtExpiresIn: "24h",
      refreshTokenExpiresIn: "30d",
    }
  }

  // ---- Authentication ----

  async authenticate(
    provider: string,
    actorType: string,
    authData: Record<string, unknown>
  ): Promise<AuthTypes.AuthenticationResponse> {
    const authProvider = this.authProviders_.get(provider)

    if (!authProvider) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Auth provider "${provider}" not found. Available providers: ${Array.from(this.authProviders_.keys()).join(", ")}`
      )
    }

    const result = await authProvider.authenticate(authData)

    if (result.error) {
      return {
        success: false,
        error: result.error,
      }
    }

    if (result.authIdentity) {
      // Generate JWT token
      const token = this.generateToken({
        auth_identity_id: result.authIdentity.id,
        actor_id: result.authIdentity.app_metadata?.[actorType]?.id,
        actor_type: actorType,
      })

      return {
        success: true,
        authIdentity: result.authIdentity,
        token,
      }
    }

    // For OAuth, return redirect URL
    if (result.location) {
      return {
        success: true,
        location: result.location,
      }
    }

    return { success: false, error: "Authentication failed" }
  }

  async register(
    provider: string,
    actorType: string,
    authData: Record<string, unknown>
  ): Promise<AuthTypes.AuthenticationResponse> {
    const authProvider = this.authProviders_.get(provider)

    if (!authProvider) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Auth provider "${provider}" not found`
      )
    }

    // Check if identity already exists
    if (authData.email) {
      const existing = await this.providerIdentityRepository_.find({
        where: {
          provider,
          entity_id: authData.email as string,
        },
      })

      if (existing?.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Identity already exists for ${authData.email} with provider ${provider}`
        )
      }
    }

    const result = await authProvider.register(authData)

    if (result.error) {
      return { success: false, error: result.error }
    }

    // Create auth identity and provider identity
    const authIdentity = await this.authIdentityRepository_.create([{
      app_metadata: {},
    }])

    await this.providerIdentityRepository_.create([{
      auth_identity_id: authIdentity[0].id,
      provider,
      entity_id: result.entity_id || (authData.email as string),
      provider_metadata: result.provider_metadata || {},
    }])

    const token = this.generateToken({
      auth_identity_id: authIdentity[0].id,
      actor_type: actorType,
    })

    return {
      success: true,
      authIdentity: authIdentity[0],
      token,
    }
  }

  // ---- OAuth Callback ----

  async validateCallback(
    provider: string,
    actorType: string,
    callbackData: Record<string, unknown>
  ): Promise<AuthTypes.AuthenticationResponse> {
    const authProvider = this.authProviders_.get(provider)

    if (!authProvider) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Auth provider "${provider}" not found`
      )
    }

    if (!authProvider.validateCallback) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Provider "${provider}" does not support OAuth callbacks`
      )
    }

    const result = await authProvider.validateCallback(callbackData)

    if (result.error) {
      return { success: false, error: result.error }
    }

    // Find or create auth identity
    let providerIdentity = await this.providerIdentityRepository_.find({
      where: {
        provider,
        entity_id: result.entity_id,
      },
    })

    let authIdentity
    if (providerIdentity?.length) {
      authIdentity = await this.authIdentityRepository_.find({
        where: { id: providerIdentity[0].auth_identity_id },
      })
    } else {
      // Create new identity for first-time OAuth login
      authIdentity = await this.authIdentityRepository_.create([{
        app_metadata: {},
      }])

      await this.providerIdentityRepository_.create([{
        auth_identity_id: authIdentity[0].id,
        provider,
        entity_id: result.entity_id,
        provider_metadata: result.provider_metadata || {},
        user_metadata: result.user_metadata || {},
      }])
    }

    const identity = authIdentity?.[0]
    const token = this.generateToken({
      auth_identity_id: identity.id,
      actor_id: identity.app_metadata?.[actorType]?.id,
      actor_type: actorType,
    })

    return {
      success: true,
      authIdentity: identity,
      token,
    }
  }

  // ---- Token Management ----

  generateToken(payload: Record<string, unknown>): string {
    if (!this.config_.jwtSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "JWT_SECRET is not configured. Set it in environment variables."
      )
    }

    return jwt.sign(payload, this.config_.jwtSecret, {
      expiresIn: this.config_.jwtExpiresIn,
    })
  }

  verifyToken(token: string): Record<string, unknown> {
    if (!this.config_.jwtSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "JWT_SECRET is not configured"
      )
    }

    try {
      return jwt.verify(token, this.config_.jwtSecret) as Record<string, unknown>
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new MedusaError(
          MedusaError.Types.UNAUTHORIZED,
          "JWT token expired. Use POST /auth/token/refresh to get a new token."
        )
      }
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Invalid JWT token"
      )
    }
  }

  async refreshToken(
    token: string
  ): Promise<{ token: string }> {
    // Decode without verification to get identity
    const decoded = jwt.decode(token) as Record<string, unknown>

    if (!decoded?.auth_identity_id) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Invalid token for refresh"
      )
    }

    // Verify identity still exists
    const identity = await this.authIdentityRepository_.find({
      where: { id: decoded.auth_identity_id },
    })

    if (!identity?.length) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Auth identity no longer exists"
      )
    }

    const newToken = this.generateToken({
      auth_identity_id: decoded.auth_identity_id,
      actor_id: decoded.actor_id,
      actor_type: decoded.actor_type,
    })

    return { token: newToken }
  }

  // ---- Password Reset ----

  async generateResetPasswordToken(
    provider: string,
    entityId: string
  ): Promise<string> {
    const providerIdentity = await this.providerIdentityRepository_.find({
      where: { provider, entity_id: entityId },
    })

    if (!providerIdentity?.length) {
      // Don't reveal whether the email exists
      // Return silently to prevent enumeration
      return ""
    }

    const resetToken = jwt.sign(
      {
        provider_identity_id: providerIdentity[0].id,
        entity_id: entityId,
      },
      this.config_.jwtSecret,
      { expiresIn: "15m" }
    )

    return resetToken
  }
}
