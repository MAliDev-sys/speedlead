"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const LOGO_BUCKET = "org-logos";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Saves the editable business profile (Settings → Business profile): the
 * org's name, logo, contact details and alert destinations, plus the
 * signed-in user's own name/phone. Org fields go through the session
 * client, so the "owners/admins can update their org" RLS policy is what
 * actually enforces who can edit them; the logo upload uses the
 * service-role client (the bucket has no browser-writable policies), so
 * the same owner/admin check is repeated explicitly before it.
 */
export async function saveBusinessProfile(_prevState: unknown, formData: FormData) {
  const { org, role, userId } = await requireCurrentOrg();
  const field = (key: string) => String(formData.get(key) ?? "").trim();
  const optional = (key: string) => field(key) || null;

  const name = field("name");
  if (!name) return { error: "Business name is required." };

  const website = optional("website");
  if (website && !/^https?:\/\/\S+\.\S+$/i.test(website)) {
    return { error: "Website must be a full URL, e.g. https://example.com" };
  }

  const alertEmail = optional("alert_email");
  if (alertEmail && !/^\S+@\S+\.\S+$/.test(alertEmail)) {
    return { error: "Alert email doesn't look like a valid email address." };
  }

  const canEditOrg = role === "owner" || role === "admin";
  let logoUrl: string | null | undefined; // undefined = leave unchanged

  if (formData.get("remove_logo") === "on") logoUrl = null;

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!canEditOrg) return { error: "Only the account owner or an admin can change the logo." };
    const ext = LOGO_TYPES[logo.type];
    if (!ext) return { error: "Logo must be a PNG, JPG or WebP image." };
    if (logo.size > LOGO_MAX_BYTES) return { error: "Logo must be 2MB or smaller." };

    const admin = createAdminClient();
    // New filename per upload so browsers/CDN never serve a stale cached logo.
    const path = `${org.id}/logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(LOGO_BUCKET)
      .upload(path, logo, { contentType: logo.type });
    if (uploadError) return { error: `Logo upload failed: ${uploadError.message}` };
    logoUrl = admin.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const supabase = await createClient();

  if (canEditOrg) {
    const { error } = await supabase
      .from("organizations")
      .update({
        name,
        business_type: optional("business_type"),
        timezone: field("timezone") || org.timezone,
        website,
        business_phone: optional("business_phone"),
        business_address: optional("business_address"),
        alert_email: alertEmail,
        alert_phone: optional("alert_phone"),
        ...(logoUrl !== undefined ? { logo_url: logoUrl } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", org.id);
    if (error) return { error: error.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: optional("full_name"), phone: optional("phone") });
  if (profileError) return { error: profileError.message };

  revalidatePath("/", "layout");
  return {
    message: canEditOrg
      ? "Business profile saved."
      : "Your details were saved. Only the owner or an admin can change business details.",
  };
}
