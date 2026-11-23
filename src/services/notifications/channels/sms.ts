import "server-only";

export interface SmsMessage {
  to: string;
  body: string;
  senderId?: string;
  templateId?: string;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isMock?: boolean;
}

/**
 * Provider-agnostic SMS Adapter interface.
 * Designed to integrate future enterprise SMS gateways (e.g. Twilio, AWS SNS, Karix, Gupshup, Exotel)
 * without leaking provider-specific code into business logic.
 */
export interface SmsProviderAdapter {
  readonly providerName: string;
  isConfigured(): boolean;
  sendSms(message: SmsMessage): Promise<SmsSendResult>;
}

/**
 * Default No-Op SMS Adapter.
 * Explicitly states that SMS gateway is unconfigured / coming soon.
 * Never fakes success silently.
 */
export class NoopSmsAdapter implements SmsProviderAdapter {
  readonly providerName = "NONE";

  isConfigured(): boolean {
    return false;
  }

  async sendSms(message: SmsMessage): Promise<SmsSendResult> {
    console.warn(
      `[SMS Adapter] Send attempted to ${message.to.slice(0, 4)}*** but no SMS provider is configured. SMS channel is coming soon.`
    );
    return {
      success: false,
      error: "SMS gateway provider is not configured (Feature coming soon).",
    };
  }
}

// Current active provider instance (No-Op driver)
export const smsAdapter: SmsProviderAdapter = new NoopSmsAdapter();

