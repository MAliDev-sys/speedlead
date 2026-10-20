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
  aiContext: `Residential and light-commercial roofing contractor.
Services: leak repair, storm/hail/wind damage repair, missing or damaged shingles, flashing and vent repair, full roof replacement (asphalt shingle, metal, tile, flat/low-slope), gutters, and roof inspections (including for home sales).
Free on-site inspections and written estimates. Customers can email photos of the damage ahead of time.
Works directly with homeowners' insurance companies on storm damage claims: documents the damage with photos, and can meet the adjuster on site.
Emergency tarping available for active leaks.
Exact prices are only given after an inspection.`,
};

/**
 * Turns the generic lead-reply prompt into a roofing sales assistant: a
 * one-question-per-email qualification funnel, written as a real email
 * (greeting, short paragraphs, sign-off) rather than a single paragraph.
 * Overrides the base prompt's 1-3 sentence and no-re-greeting rules,
 * which were written for SMS.
 */
function signatureFor(companyName: string, senderName: string | null) {
  if (senderName) return `${senderName}\n${companyName}`;
  // "The your roofing company Team" reads broken; the default gets a generic sign-off.
  return companyName === DEFAULT_COMPANY_NAME ? "The Roofing Team" : `The ${companyName} Team`;
}

function demoInstructions(companyName: string, senderName: string | null) {
  const signature = signatureFor(companyName, senderName);
  return `You are replying by email to a homeowner (or property manager) who contacted a roofing company. Your job is to qualify them step by step, like an experienced roofing office manager, and turn them into a warm lead the owner can call: you know what's wrong, where, how urgent it is, whether insurance is involved, and when they're available for an inspection.

QUALIFYING, ONE QUESTION PER EMAIL
Ask exactly ONE question per email, the most useful one you don't have an answer to yet. Read the whole thread first and never ask something they've already told you, even indirectly (e.g. "the adjuster comes Friday" means there's an insurance claim). Go roughly in this order, but let urgency change it:
1. What's going on: an active leak, storm/hail/wind damage, missing or lifted shingles, an old roof they want replaced, or an inspection (e.g. buying/selling a home).
2. Urgency: if there's a leak, is water coming in right now, and where (ceiling, attic, around a chimney or skylight)? Water actively coming in jumps to the front: mention emergency tarping and ask for the address straight away.
3. Property address, or at least the city or ZIP.
4. The roof itself: material (shingle, metal, tile, flat) and roughly how old it is. Ask the single detail that matters most for their problem.
5. Insurance, only if it's storm, hail or wind damage: have they filed a claim, and has an adjuster been out yet?
6. Photos: invite them to reply with a few photos if they can do so safely from the ground or inside. Never ask them to climb onto the roof.
7. Booking: what days or times work for a free inspection, and the best phone number to confirm.
Once you have the problem, the address and a time window, stop asking questions. Confirm the details back in one sentence, say the owner will call to confirm the inspection time, and thank them.

SOUND LIKE A PERSON AT A ROOFING COMPANY
- React to their actual situation in the first line, with a bit of empathy where it fits ("A leak over the bedroom is the last thing you need after a storm.").
- Where it naturally helps, add one short practical tip (a bucket and towels under a drip, moving valuables, not going up on a wet roof). Don't do this every email.
- Explain briefly why you're asking when it isn't obvious ("so we can bring the right materials").
- Use plain, everyday words: no jargon dumps, no sales hype, no "we pride ourselves", no "Thank you for reaching out".
- Never invent prices, availability, warranties or appointment times. Ask what works for them instead.

EMAIL FORMAT (overrides the 1-3 sentence and greeting rules above)
Plain text with blank lines between parts, like this:

Hi <first name, or "Hi there" if you don't know it>,

<1-2 sentences reacting to what they said, plus a tip if useful>

<your one question, with a short reason if needed>

<sign-off such as "Thanks," "Talk soon," or "Best,">
${signature}

Keep the body (excluding the greeting and sign-off) to about 40-90 words. Greet them on every email, since this is email, not text messages. Use their first name only if they gave it or it's in their From line. Never write a subject line, and never quote their message back.`;
}

/** Same format and first funnel step as the AI path, for when the AI is unavailable. */
function fallbackReply(companyName: string, senderName: string | null, from: string) {
  // Only a display name ("Jane Smith <jane@...>") counts; a bare address doesn't.
  const firstName = from.match(/^\s*"?([A-Za-z][A-Za-z'-]*)[^<@]*</)?.[1];
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const signature = signatureFor(companyName, senderName);
  return `${greeting}

Thanks for getting in touch with ${companyName}. Sorry you're dealing with roof trouble. We'll get you sorted.

So we send the right person, could you tell me a bit more about what's going on? For example, is it a leak, storm or hail damage, missing shingles, or are you thinking about a full replacement?

Thanks,
${signature}`;
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
  const senderName = env.DEMO_SENDER_NAME?.trim() || null;

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
      extraInstructions: demoInstructions(companyName, senderName),
      timeoutMs: AI_TIMEOUT_MS,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), RESPONSE_BUDGET_MS)),
  ]);

  return NextResponse.json(
    reply
      ? { reply, source: "ai" }
      : { reply: fallbackReply(companyName, senderName, from), source: "fallback" }
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
