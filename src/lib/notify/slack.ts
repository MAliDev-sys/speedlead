import "server-only";

export interface SendSlackResult {
  ok: boolean;
  error?: string;
}

/**
 * Posts a new-lead alert to a tenant's Slack workspace via an Incoming
 * Webhook URL (stored per-org in `integrations` where type = 'slack',
 * config = { webhook_url }).
 *
 * MVP note: we use a Block Kit button with a `url` (deep link into the
 * dashboard) rather than an `action_id`. A `url` button just opens a link —
 * no Slack "interactivity" request URL / OAuth bot backend required. True
 * one-click "Claim" from inside Slack (via chat.postMessage + a bot token +
 * an /api/webhooks/slack/interactions handler) is a natural phase-2 upgrade
 * once a tenant wants it, without changing this call site.
 */
export async function sendSlackLeadAlert(params: {
  webhookUrl: string;
  orgName: string;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  leadMessage: string | null;
  source: string;
  leadUrl: string;
}): Promise<SendSlackResult> {
  const summary = params.leadName || params.leadPhone || params.leadEmail || "New lead";

  const contactLines = [
    params.leadPhone ? `*Phone:* ${params.leadPhone}` : null,
    params.leadEmail ? `*Email:* ${params.leadEmail}` : null,
    `*Source:* ${params.source}`,
  ].filter(Boolean).join("\n");

  const body = {
    text: `🚨 New lead for ${params.orgName}: ${summary}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🚨 *New lead: ${summary}*\n${contactLines}${
            params.leadMessage ? `\n*Message:* ${params.leadMessage}` : ""
          }`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open in SpeedLead" },
            url: params.leadUrl,
            style: "primary",
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(params.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `slack_${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown_error";
    console.error("[slack] send failed", error);
    return { ok: false, error };
  }
}
