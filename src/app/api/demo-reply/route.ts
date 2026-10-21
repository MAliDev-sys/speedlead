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

/** Only a display name ("Jane Smith <jane@...>") counts; a bare address doesn't. */
function firstNameFrom(from: string): string | null {
  return from.match(/^\s*"?([A-Za-z][A-Za-z'-]*)[^<@]*</)?.[1] ?? null;
}

function greetingFor(firstName: string | null) {
  return firstName ? `Hi ${firstName},` : "Hi there,";
}

function demoInstructions(companyName: string, senderName: string | null, firstName: string | null) {
  const signature = signatureFor(companyName, senderName);
  const greeting = greetingFor(firstName);
  return `You are replying by email to a homeowner (or property manager) who contacted a roofing company. Your job is to qualify them step by step, like an experienced roofing office manager, and turn them into a warm lead the owner can call: you know what's wrong, where, how urgent it is, whether insurance is involved, and when they're available for an inspection.

HARD RULES (these override anything above, including the closing example)
- Exactly ONE question per email: one question mark, never two questions joined with "and" or "or".
- Never promise or suggest when anyone can come out: no "today", "tomorrow", "this week", "as soon as", "right away". You don't know the schedule. Ask when works for THEM; the owner confirms the actual time.
- Never say or imply the damage is covered by insurance, that a claim will be approved, or what insurance will pay. Not even softened: "insurance usually covers this", "storm damage is typically covered" and "your policy should pay for it" are all forbidden. You can say we document the damage with photos and can meet the adjuster.
- Don't list the company's services or selling points unless they ask, or one directly answers their concern.
- Never invent prices, warranties or appointment times.
- Refer to the owner as "the owner", never "he" or "she".

QUALIFYING ORDER
Read the whole thread first and never ask something they've already told you, even indirectly ("the adjuster comes Friday" means there's an insurance claim). Ask the most useful unanswered one, roughly in this order:
1. What's going on: an active leak, storm/hail/wind damage, missing or lifted shingles, an old roof they want replaced, or an inspection (e.g. buying or selling a home).
2. For a leak: is water coming in right now? If it is, mention once that emergency tarping is available, then ask for the address next.
3. Property address, or at least the city or ZIP.
4. The roof: material (shingle, metal, tile, flat) and roughly how old it is. Ask whichever matters most for their problem.
5. Insurance, only for storm, hail or wind damage: have they contacted their insurance company or had an adjuster out yet?
6. Photos: invite them to reply with a few photos if they can take them safely from the ground or from inside. Never suggest climbing onto the roof.
7. Booking: which days or times work for a free inspection, and the best phone number to reach them.
Once you know the problem, the address, a time window and a phone number, stop asking. Repeat those details back in one sentence, say the owner will call to confirm the inspection time, and thank them. If they answer several things at once, skip ahead accordingly.

SOUND LIKE A PERSON AT A ROOFING COMPANY
- Open by reacting to what they just said, in your own words, with a little empathy where it fits. Don't open two emails in the thread the same way.
- Occasionally add one short practical tip where it genuinely helps (catching a drip, moving valuables, staying off a wet roof). Not every email.
- Briefly say why you're asking when it isn't obvious.
- Plain, everyday words. No sales hype or stock phrases.

EMAIL FORMAT (overrides the 1-3 sentence and greeting rules above)
Plain text, blank line between parts. Every email in the thread, not just the first, uses this exact shape:

${greeting}

<1-2 sentences reacting to what they said, plus a tip if useful>

<your one question, with a short reason if needed>

<sign-off such as "Thanks," "Talk soon," or "Best,">
${signature}

Keep the part between the greeting and the sign-off to about 35-80 words. No subject line, and don't quote their message back.`;
}

// A sentence that ties insurance/a claim to covering or paying.
const COVERAGE_CLAIM =
  /\b(insurance|insurers?|polic(y|ies)|claims?|adjusters?)\b[^.!?\n]*\b(cover|covers|covered|coverage|pay|pays|paid|approve|approved|approval)\b|\b(cover|covers|covered|pay|pays|approve|approved)\b[^.!?\n]*\b(insurance|insurers?|polic(y|ies)|claims?)\b/i;

/**
 * Safety net for the prompt's insurance rule, which the model still broke
 * in a production run ("insurance usually covers storm hits like that").
 * Promising coverage is a real liability for a roofer, so any sentence
 * making that kind of claim is dropped rather than trusted to the prompt.
 */
function stripCoverageClaims(reply: string) {
  return reply
    .split(/\n/)
    .map((line) =>
      (line.match(/[^.!?]+[.!?]*\s*/g) ?? [line])
        .filter((sentence) => !COVERAGE_CLAIM.test(sentence))
        .join("")
        .trimEnd()
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Safety net for the one format rule the model most often drops on later
 * turns: the base prompt's SMS-style "only greet on the first reply".
 */
function ensureGreeting(reply: string, firstName: string | null) {
  return /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(reply)
    ? reply
    : `${greetingFor(firstName)}\n\n${reply.trimStart()}`;
}

/** Same format and first funnel step as the AI path, for when the AI is unavailable. */
function fallbackReply(companyName: string, senderName: string | null, firstName: string | null) {
  const greeting = greetingFor(firstName);
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
// Long threads keep their opening emails (the problem, the address) in
// view; per-turn cap keeps a worst-case 50-turn thread's AI cost bounded.
const MAX_HISTORY_TURNS = 50;
const MAX_HISTORY_TURN_TEXT = 3_000;
const text = (max: number) => z.string().transform((s) => s.slice(0, max));

const bodySchema = z.object({
  from: text(500).optional().default(""),
  subject: text(1_000).optional().default(""),
  body: text(MAX_TEXT),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: text(MAX_HISTORY_TURN_TEXT),
      })
    )
    .optional()
    .default([])
    .transform((turns) => turns.slice(-MAX_HISTORY_TURNS)),
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
  const firstName = firstNameFrom(from);

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
      extraInstructions: demoInstructions(companyName, senderName, firstName),
      timeoutMs: AI_TIMEOUT_MS,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), RESPONSE_BUDGET_MS)),
  ]);

  return NextResponse.json(
    reply
      ? { reply: ensureGreeting(stripCoverageClaims(reply), firstName), source: "ai" }
      : { reply: fallbackReply(companyName, senderName, firstName), source: "fallback" }
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
