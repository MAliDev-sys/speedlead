import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv, hasAnthropic } from "@/lib/env";

// Hard latency budget for the whole speed-to-lead promise: this is one of
// several channels racing in notifyNewLead()'s Promise.all, and the SMS
// webhook path (see webhooks/twilio/sms) needs to answer well inside
// Twilio's ~15s webhook timeout. 8s leaves comfortable headroom on both
// while still being generous for Haiku, which is fast.
const AI_TIMEOUT_MS = 8_000;

let client: Anthropic | null = null;
function getClient() {
  const env = getEnv();
  if (!hasAnthropic(env)) return null;
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are answering, on behalf of a local home-services business, as a quick auto-reply to a prospective customer's message. You are NOT the business owner and must not pretend to be human.

Rules:
- Only use facts given to you in "Business info" below. Never invent prices, exact availability, guarantees, or policies that aren't stated there.
- If the customer asks something the business info doesn't cover, say you're not certain and that a team member will follow up with specifics — don't guess.
- Keep it short and text-message appropriate: 1-3 sentences, no markdown, no headers, no emoji unless the business info uses them.
- Always make clear a real team member will also be in touch — this message is an instant acknowledgment, not the final word.
- Never mention that you are an AI, a language model, or Claude.`;

/**
 * Generates a short, grounded auto-reply to a customer's message. Returns
 * null (never throws) on any failure, missing API key, or timeout — every
 * call site MUST fall back to a fixed template in that case, so the
 * speed-to-lead SLA (reply within seconds, well under the 30-60s bar) is
 * met regardless of whether the AI path succeeds.
 */
export async function generateAiReply(params: {
  businessName: string;
  businessType: string | null;
  aiContext: string | null;
  customerMessage: string;
  channel: "sms" | "email";
}): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const trimmedMessage = params.customerMessage.trim();
  if (!trimmedMessage) return null;

  const businessInfo = [
    `Business name: ${params.businessName}`,
    params.businessType ? `Business type: ${params.businessType}` : null,
    params.aiContext ? `Details: ${params.aiContext}` : "Details: (none provided — keep it general)",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await anthropic.messages.create(
      {
        model: "claude-haiku-4-5",
        max_tokens: params.channel === "email" ? 400 : 200,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Business info:\n${businessInfo}\n\nCustomer's message: "${trimmedMessage}"\n\nWrite the auto-reply.`,
          },
        ],
      },
      { timeout: AI_TIMEOUT_MS }
    );

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
    return text || null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.warn(`[ai-respond] Claude API error (${err.status}):`, err.message);
    } else {
      console.warn("[ai-respond] request failed:", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
