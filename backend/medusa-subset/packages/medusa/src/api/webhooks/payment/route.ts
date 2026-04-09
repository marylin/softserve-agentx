import { MedusaRequest, MedusaResponse } from "@medusajs/medusa"
import { MedusaError } from "@medusajs/utils"

// POST /webhooks/payment/:provider - Receive payment provider webhooks
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { provider } = req.params

  const paymentModuleService = req.scope.resolve("paymentModuleService")

  try {
    // The raw body is needed for signature verification
    // Express must be configured to preserve the raw body
    const rawBody = req.rawBody
    const signature = req.headers["stripe-signature"] ||
                      req.headers["paypal-transmission-sig"] ||
                      req.headers["x-webhook-signature"]

    if (!rawBody) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Webhook raw body is required for signature verification. Ensure body parser preserves raw body."
      )
    }

    // Verify webhook signature and process event
    await paymentModuleService.processWebhookEvent(provider, {
      headers: req.headers,
      body: req.body,
      rawBody: rawBody,
      signature: signature,
    })

    res.status(200).json({ received: true })
  } catch (error) {
    if (error.message?.includes("signature verification failed")) {
      // Log but return 400 to provider
      console.error(
        `Webhook signature verification failed for provider ${provider}:`,
        error.message
      )
      res.status(400).json({
        error: "Webhook signature verification failed",
        provider,
      })
      return
    }

    // For other errors, log and return 500 so the provider retries
    console.error(
      `Webhook processing error for provider ${provider}:`,
      error.message
    )
    res.status(500).json({
      error: "Webhook processing failed",
      provider,
    })
  }
}
