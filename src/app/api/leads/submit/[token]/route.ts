import { NextResponse } from "next/server";
import { getLeadSourceByToken, createLeadAndNotify, LeadValidationError } from "@/lib/leads";

export const dynamic = "force-dynamic";

// Public, cross-origin endpoint: the embeddable widget (public/widget.js) is
// pasted onto arbitrary customer websites, so it must be reachable from any
// origin. The capability is the unguessable :token itself, not same-origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Public lead-capture endpoint used by the embeddable widget:
 * POST /api/leads/submit/:token  (see /widget.js and lead_sources.type = 'form')
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const lookup = await getLeadSourceByToken(token);
  if (!lookup) {
    return NextResponse.json(
      { error: "Unknown or inactive form token." },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let body: Record<string, unknown>;
  try {
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch {
    return NextResponse.json(
      { error: "Could not parse request body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Honeypot field: the widget renders a hidden "website" input real users
  // never fill in; bots that auto-fill every field trip it.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS });
  }

  try {
    const lead = await createLeadAndNotify(lookup.source, lookup.org, {
      name: str(body.name),
      phone: str(body.phone),
      email: str(body.email),
      message: str(body.message),
      raw_payload: body as never,
    });
    return NextResponse.json({ ok: true, lead_id: lead.id }, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof LeadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422, headers: CORS_HEADERS });
    }
    console.error("[leads/submit] failed", err);
    return NextResponse.json({ error: "Internal error." }, { status: 500, headers: CORS_HEADERS });
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
