import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { generateAiReply } from "@/lib/ai-respond";
import type { ConversationTurn } from "@/lib/conversation";

/**
 * Stateless demo of the AI lead-reply logic for a sample roofing company:
 * takes an inbound email plus prior turns and returns the reply text that
 * would be sent. Nothing is stored and no email is sent — no org, lead or
 * message rows are touched; the Gmail demo's Apps Script does the sending.
 * Gated by the x-gmail-demo-key header (GMAIL_DEMO_KEY env). The company
 * name comes from DEMO_COMPANY_NAME.
 *
 * Like every real reply path, this always returns something within
 * RESPONSE_BUDGET_MS: with no Anthropic key configured, or on AI
 * failure/timeout, it falls back to a fixed roofing reply that still asks
 * the qualifying questions. `source` says which one was returned.
 */

export const maxDuration = 30;

// Apps Script's UrlFetchApp and a demo prospect both expect a quick
// answer; the AI gets most of it, the route-level race covers SDK retries.
const AI_TIMEOUT_MS = 15_000;
const RESPONSE_BUDGET_MS = 18_000;

const DEFAULT_COMPANY_NAME = "your roofing company";

const DEMO_BUSINESS = {
  businessType: "roofing",
  aiContext: `Residential roofing contractor: storm/hail/wind damage repair, leak repair, and full roof replacement (asphalt shingle, metal, tile).
Free on-site inspections and estimates.
Works directly with homeowners' insurance companies on storm damage claims, including helping document damage for the adjuster.
Emergency tarping available for active leaks.`,
};

const DEMO_INSTRUCTIONS = `This is a roofing lead replying by email. Keep the reply short (2-3 sentences) and roofing-specific — speak to their roof problem, not home services in general.
End by asking one or two qualifying questions (two is fine here, overriding the one-question rule), picking whichever of these the customer hasn't already answered in the conversation: the property address, the type of damage (e.g. leak, missing shingles, hail/storm damage, age/wear), and whether they're filing or planning to file an insurance claim.
If they've already answered all three, skip the questions and offer to schedule a free on-site inspection instead.`;

function fallbackReply(companyName: string) {
  return `Thanks for reaching out to ${companyName} — we can help with that. What's the property address, and what kind of damage are you seeing (leak, missing shingles, hail or storm damage)? Also, are you planning to go through insurance on this?`;
}

// Long email threads (quoted replies, signatures) are truncated rather
// than rejected, so a real prospect's email never gets a 400.
const MAX_TEXT = 8_000;
const text = (max: number) => z.string().transform((s) => s.slice(0, max));

const bodySchema = z.object({
  from: text(500).optional().default(""),
  subject: text(1_000).optional().default(""),
  body: text(MAX_TEXT),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: text(MAX_TEXT),
      })
    )
    .optional()
    .default([])
    .transform((turns) => turns.slice(-20)),
});

export async function POST(request: Request) {
  const env = getEnv();
  if (!env.GMAIL_DEMO_KEY) {
    return NextResponse.json({ error: "GMAIL_DEMO_KEY not configured." }, { status: 500 });
  }
  if (!keyMatches(request.headers.get("x-gmail-demo-key"), env.GMAIL_DEMO_KEY)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const companyName = env.DEMO_COMPANY_NAME?.trim() || DEFAULT_COMPANY_NAME;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body.", issues: parsed.error.issues }, { status: 400 });
  }
  const { from, subject, body, history } = parsed.data;
  if (!body.trim() && !subject.trim()) {
    return NextResponse.json({ error: "body (or subject) is required." }, { status: 400 });
  }

  // generateAiReply appends the new message as a user turn, so an
  // unanswered user turn at the end of history is folded into it to keep
  // roles alternating.
  const turns = normalizeHistory(history);
  const unanswered = turns[turns.length - 1]?.role === "user" ? turns.pop()!.content : null;

  const customerMessage = [
    unanswered,
    from ? `From: ${from}` : null,
    subject ? `Subject: ${subject}` : null,
    body.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const reply = await Promise.race([
    generateAiReply({
      ...DEMO_BUSINESS,
      businessName: companyName,
      history: turns,
      customerMessage,
      channel: "email",
      extraInstructions: DEMO_INSTRUCTIONS,
      timeoutMs: AI_TIMEOUT_MS,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), RESPONSE_BUDGET_MS)),
  ]);

  return NextResponse.json(
    reply ? { reply, source: "ai" } : { reply: fallbackReply(companyName), source: "fallback" }
  );
}

function keyMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Claude needs the conversation to start with a user turn and alternate
 * roles; caller-supplied history may not. Drops empty turns and any
 * leading assistant turn, and merges consecutive same-role turns.
 */
function normalizeHistory(history: ConversationTurn[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const turn of history) {
    const content = turn.content.trim();
    if (!content) continue;
    if (turns.length === 0 && turn.role === "assistant") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === turn.role) last.content += `\n\n${content}`;
    else turns.push({ role: turn.role, content });
  }
  return turns;
}
