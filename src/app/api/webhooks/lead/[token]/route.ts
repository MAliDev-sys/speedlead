import { NextResponse } from "next/server";
import { getLeadSourceByToken, createLeadAndNotify, LeadValidationError } from "@/lib/leads";

export const dynamic = "force-dynamic";

/**
 * Generic lead intake webhook: POST /api/webhooks/lead/:token
 *
 * Point Zapier, Google Local Services Ads, Facebook Lead Ads, or any CRM's
 * outgoing webhook here. Each org gets its own unique, unguessable :token
 * (see lead_sources.public_token) instead of exposing org ids.
 *
 * Accepts a JSON body and tolerates a few common field-name variants so
 * most no-code tools (Zapier field mapping, Facebook Lead Ads default
 * export, etc.) work without custom transforms.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const lookup = await getLeadSourceByToken(token);
  if (!lookup) {
    return NextResponse.json({ error: "Unknown or inactive webhook token." }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const name =
    firstString(payload, ["name", "full_name", "fullName"]) ??
    joinNames(firstString(payload, ["first_name", "firstName"]), firstString(payload, ["last_name", "lastName"]));
  const phone = firstString(payload, ["phone", "phone_number", "phoneNumber", "mobile"]);
  const email = firstString(payload, ["email", "email_address", "emailAddress"]);
  const message = firstString(payload, ["message", "notes", "comments", "details"]);

  try {
    const lead = await createLeadAndNotify(lookup.source, lookup.org, {
      name,
      phone,
      email,
      message,
      raw_payload: payload as never,
    });
    return NextResponse.json({ ok: true, lead_id: lead.id }, { status: 201 });
  } catch (err) {
    if (err instanceof LeadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[webhooks/lead] failed", err);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function joinNames(first: string | null, last: string | null): string | null {
  const parts = [first, last].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
