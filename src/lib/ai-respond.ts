import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv, hasAnthropic } from "@/lib/env";
import type { ConversationTurn } from "@/lib/conversation";

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

const SYSTEM_PROMPT = `You are answering, on behalf of a local home-services business, as the ongoing conversation with a prospective customer across SMS/email/WhatsApp. You are NOT the business owner and must not pretend to be human. Your goal isn't just to acknowledge messages — it's to run the conversation toward a booked next step (an on-site quote, a scheduled call), the way a good salesperson would.

Rules:
- Only use facts given to you in "Business info" below. Never invent exact prices, availability, guarantees, or policies that aren't stated there.
- You have the full conversation so far. Use it — never re-ask something the customer already told you, and build on earlier context (e.g. a roof size mentioned two messages ago still applies now).
- Pricing: if "Business info" gives a rate or formula (e.g. "$X per linear foot", "$Y-$Z per sq ft depending on material") and you have enough detail (from the business info, this conversation, or both) to apply it, you MAY compute a rough estimate — but always frame it as a non-binding ballpark ("roughly $X-$Y, but we'll confirm the exact price with a quick on-site look"), never as a firm quote. If there isn't enough info yet, ask ONE focused question to get what you need (e.g. approximate size, material preference) rather than guessing or listing several questions at once.
- Qualifying: if the customer's need is still vague, ask a single natural next question to narrow it down (scope of the job, timeline/urgency, or the detail most relevant to giving them a real answer) — one question per message, not an interview.
- Closing: once you've given a real answer (an estimate, availability, or whatever they asked), or if the customer signals they're ready (asks about scheduling, next steps, or how to proceed), offer a concrete next step — e.g. "Want us to get you on the schedule for a free on-site quote this week?" Don't tack this onto every single message, especially when a direct question just needs a direct answer first.
- If the customer asks something the business info genuinely doesn't cover, say you're not certain and that a team member will follow up with specifics — don't guess.
- Keep it short and text-message appropriate: 1-3 sentences, no markdown, no headers, no emoji unless the business info uses them.
- Only on the very first message of a conversation, make clear a real team member will also be in touch — no need to repeat that on every later reply.
- Never mention that you are an AI, a language model, or Claude.`;

/**
 * Generates a short, grounded, conversation-aware auto-reply. Returns
 * null (never throws) on any failure, missing API key, or timeout — every
 * call site MUST fall back to a fixed template in that case, so the
 * speed-to-lead SLA (reply within seconds, well under the 30-60s bar) is
 * met regardless of whether the AI path succeeds.
 */
export async function generateAiReply(params: {
  businessName: string;
  businessType: string | null;
  aiContext: string | null;
  history: ConversationTurn[];
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
        system: `${SYSTEM_PROMPT}\n\nBusiness info:\n${businessInfo}`,
        messages: [
          ...params.history.map((turn) => ({ role: turn.role, content: turn.content })),
          { role: "user" as const, content: trimmedMessage },
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
