// Sends a sample roofing lead to /api/demo-reply and prints the result.
//
//   npm run test:demo-reply                                  (local dev, key from .env.local)
//   node scripts/test-demo-reply.mjs --url https://speedlead-nine.vercel.app
//   node scripts/test-demo-reply.mjs --key <key> --body "Hail hit my roof yesterday"
//   node scripts/test-demo-reply.mjs --url https://speedlead-nine.vercel.app --funnel
//
// Pass options by calling node directly: Windows PowerShell 5.1 drops the
// `--` that `npm run test:demo-reply -- --url ...` needs, so npm never
// forwards them.
//
// Options (all optional):
//   --url      base URL of the app (default: DEMO_URL in .env.local, else http://localhost:3000)
//   --key      demo key (default: GMAIL_DEMO_KEY in .env.local)
//   --from     sender (default: a sample prospect)
//   --subject  subject line
//   --body     email body
//   --funnel   play a scripted multi-email conversation, feeding each reply
//              back as history, to check the one-question-at-a-time flow
//
// Never hardcode the key in this file. Exits 1 on any non-200 response.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const match = argv[i].match(/^--([\w-]+)(?:=(.*))?$/);
    if (!match) continue;
    const next = argv[i + 1];
    args[match[1]] = match[2] ?? (next === undefined || next.startsWith("--") ? true : argv[++i]);
  }
  return args;
}

function readEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
    return env;
  } catch {
    return {};
  }
}

const args = parseArgs(process.argv.slice(2));
const envLocal = readEnvLocal();

const baseUrl = String(args.url ?? envLocal.DEMO_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const key = args.key ?? process.env.GMAIL_DEMO_KEY ?? envLocal.GMAIL_DEMO_KEY;
if (!key || key === true) {
  console.error("No key: pass --key <key> or set GMAIL_DEMO_KEY in .env.local");
  process.exit(1);
}

const endpoint = `${baseUrl}/api/demo-reply`;
console.log(`POST ${endpoint}`);
console.log(`Key:  ${"*".repeat(Math.min(key.length, 8))} (${key.length} chars)`);

const from = args.from ?? "Jane Prospect <jane.prospect@example.com>";

/** POSTs one email; returns the parsed reply, or exits 1 on a non-200. */
async function send({ subject, body, history }) {
  const started = Date.now();
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-gmail-demo-key": key },
      body: JSON.stringify({ from, subject, body, history }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error(`Request failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  console.log(`HTTP: ${response.status} (${elapsed}s)`);
  if (response.status !== 200 || !data?.reply) {
    console.log(`Body:\n${data ? JSON.stringify(data, null, 2) : raw.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`Source: ${data.source ?? "(not reported)"}`);
  console.log(`Reply:\n${data.reply}`);
  return data.reply;
}

if (args.funnel) {
  // A prospect who answers exactly what they're asked, one email at a time.
  const subject = "Roof leaking";
  const prospectEmails = [
    "Hi, we've got water coming through the ceiling in our upstairs bedroom since the storm last night. Can you help?",
    "It's dripping slowly right now, we put a bucket under it. It's coming from near where the ceiling meets the outside wall.",
    "We're at 1187 Maple Ridge Drive, Plano TX 75023.",
    "It's asphalt shingles, I think about 15 years old. The storm had a lot of hail too.",
    "We haven't called insurance yet, wasn't sure if we should before someone looks at it.",
    "Tomorrow afternoon or Thursday morning works. My cell is 214-555-0187.",
  ];
  const history = [];
  for (const [i, body] of prospectEmails.entries()) {
    console.log(`\n========== Prospect email ${i + 1} ==========\n${body}\n---------- Reply ----------`);
    const reply = await send({ subject: i === 0 ? subject : `Re: ${subject}`, body, history });
    history.push({ role: "user", content: body }, { role: "assistant", content: reply });
  }
} else {
  await send({
    subject: args.subject ?? "Roof leak after the storm",
    body:
      args.body ??
      "Hi, after last night's storm water started dripping through our bedroom ceiling. Can someone come take a look this week?",
    history: [],
  });
}
