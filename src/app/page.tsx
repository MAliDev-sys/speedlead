import Link from "next/link";

const CHANNELS = [
  { name: "SMS + missed-call text-back", detail: "Never lose a lead to voicemail again." },
  { name: "Email", detail: "Instant confirmation the second a form is submitted." },
  { name: "Slack", detail: "Your whole team knows about a new lead in real time." },
  { name: "WhatsApp", detail: "Meet customers where they already are." },
];

const STATS = [
  { value: "78%", label: "of customers buy from whoever responds first" },
  { value: "<5 min", label: "response window for the highest conversion rate" },
  { value: "21x", label: "more likely to qualify a lead contacted within 5 min vs. 30 min" },
];

export default function Home() {
  return (
    <div>
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight text-slate-900">⚡ SpeedLead</span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Respond to every lead in seconds — not hours.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            SpeedLead instantly texts, emails, and Slack-alerts your team the moment a lead comes
            in — from your website, Google, Facebook, or a missed call. Built for HVAC, plumbing,
            electrical, and other local service businesses.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Start your 14-day free trial
            </Link>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 py-10">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 px-4 sm:grid-cols-3">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-slate-900">{stat.value}</div>
                <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-2xl font-semibold text-slate-900">
            One missed call shouldn&apos;t cost you the job.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CHANNELS.map((channel) => (
              <div key={channel.name} className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-medium text-slate-900">{channel.name}</h3>
                <p className="mt-2 text-sm text-slate-500">{channel.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">Ready to stop losing leads?</h2>
          <p className="mt-2 text-slate-600">
            Set up takes minutes. No contracts, cancel anytime.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Start free trial
          </Link>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} SpeedLead
      </footer>
    </div>
  );
}
