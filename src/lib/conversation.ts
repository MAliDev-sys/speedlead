import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY_TURNS = 20;

/**
 * Loads a lead's customer-facing conversation as Claude-ready turns
 * (oldest first) — everything generateAiReply() needs to actually
 * remember prior exchanges instead of answering each message in
 * isolation. Only sms/email/whatsapp messages count as "the
 * conversation" (Slack is an internal team alert, never shown to the
 * customer); failed sends are excluded since we never actually said
 * that to them.
 *
 * Capped at the most recent 20 turns — plenty for any realistic lead
 * conversation without bloating every AI call's token cost.
 */
export async function getConversationHistory(leadId: string): Promise<ConversationTurn[]> {
  const admin = createAdminClient();

  const { data: messages } = await admin
    .from("messages")
    .select("direction, channel, body, status, created_at")
    .eq("lead_id", leadId)
    .in("channel", ["sms", "email", "whatsapp"])
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_TURNS);

  if (!messages) return [];

  return messages
    .reverse()
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.channel === "email" ? stripHtml(m.body) : (m.body ?? "").trim(),
    }))
    .filter((turn) => turn.content.length > 0);
}

/** Strips HTML tags for feeding email bodies into the AI as plain text. */
export function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
