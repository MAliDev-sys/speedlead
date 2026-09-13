import Link from "next/link";
import {
  Zap,
  MessageSquare,
  Mail,
  Bell,
  PhoneMissed,
  Bot,
  Clock,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const CHANNELS = [
  {
    icon: MessageSquare,
    name: "SMS + missed-call text-back",
    detail: "Never lose a lead to voicemail again. Miss a call, they get a text in seconds.",
  },
  {
    icon: Mail,
    name: "Email",
    detail: "Instant, personalized confirmation the second a form is submitted.",
  },
  {
    icon: Bell,
    name: "Slack",
    detail: "Your whole team knows about a new lead in real time, with a one-click link to claim it.",
  },
  {
    icon: Bot,
    name: "AI-generated replies",
    detail: "Answers what the customer actually asked, grounded in your business info — not a generic bot.",
  },
];

const STATS = [
  { value: "78%", label: "of customers buy from whoever responds first" },
  { value: "<60s", label: "SpeedLead's average time-to-first-response" },
  { value: "21×", label: "more likely to qualify a lead contacted within 5 min vs. 30 min" },
];

const STEPS = [
  {
    icon: PhoneMissed,
    title: "A lead comes in",
    detail: "Website form, Google, Facebook ad, or a missed call — from any source, automatically.",
  },
  {
    icon: Zap,
    title: "Instant response fires",
    detail: "SMS, email, WhatsApp, and Slack go out in seconds — synchronously, not on a queue.",
  },
  {
    icon: Clock,
    title: "Follow-up until they answer",
    detail: "An automatic drip sequence keeps nudging until a real reply comes in, then stops.",
  },
];

const BUSINESS_TYPES = ["HVAC", "Plumbing", "Electrical", "Roofing", "Landscaping", "Pest Control"];

export default function Home() {
  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Zap className="h-4.5 w-4.5" strokeWidth={2.5} />
            </span>
            SpeedLead
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700"
            >
              Get a demo
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center blur-3xl"
          >
            <div className="aspect-[1155/678] w-[72rem] bg-gradient-to-tr from-brand-400 via-brand-500 to-accent-400 opacity-20" />
          </div>

          <div className="mx-auto max-w-3xl px-4 pt-20 pb-16 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
              Built for HVAC, plumbing &amp; local service businesses
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Respond to every lead in{" "}
              <span className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">
                seconds
              </span>
              , not hours.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              SpeedLead instantly texts, emails, and Slack-alerts your team the moment a lead comes
              in — from your website, Google, Facebook, or a missed call.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700"
              >
                Get a demo
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                See how it works
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> No contract
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Cancel anytime
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Setup in minutes
              </span>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="bg-slate-900 py-14">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 px-4 sm:grid-cols-3">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-4xl font-extrabold text-transparent">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Channels */}
        <section className="mx-auto max-w-5xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              One missed call shouldn&apos;t cost you the job.
            </h2>
            <p className="mt-3 text-slate-600">
              Every channel your customers already use, wired to fire the instant a lead lands.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CHANNELS.map((channel) => (
              <div
                key={channel.name}
                className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-slate-200/60"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <channel.icon className="h-5.5 w-5.5" strokeWidth={2} />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{channel.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{channel.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-white py-20">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">How it works</h2>
              <p className="mt-3 text-slate-600">
                Three steps, fully automatic, from the moment a lead appears.
              </p>
            </div>
            <div className="relative mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
              <div
                aria-hidden
                className="absolute top-7 left-[16.5%] right-[16.5%] hidden h-px bg-gradient-to-r from-brand-200 via-brand-300 to-accent-300 sm:block"
              />
              {STEPS.map((step, i) => (
                <div key={step.title} className="relative text-center">
                  <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white ring-4 ring-white">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-600/30">
                      <step.icon className="h-6 w-6" strokeWidth={2} />
                    </div>
                  </div>
                  <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-500">
                    Step {i + 1}
                  </div>
                  <h3 className="mt-1 font-semibold text-slate-900">{step.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Business types */}
        <section className="border-y border-slate-200 bg-slate-50 py-12">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
              <ShieldCheck className="h-4 w-4 text-brand-500" />
              Built for local service businesses like yours
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {BUSINESS_TYPES.map((type) => (
                <span
                  key={type}
                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 py-20">
          <div aria-hidden className="bg-dot-grid absolute inset-0 opacity-40" />
          <div className="relative mx-auto max-w-2xl px-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Ready to stop losing leads?
            </h2>
            <p className="mt-3 text-brand-100">
              Set up takes minutes. No contracts, cancel anytime.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition hover:bg-brand-50"
            >
              Get a demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-400 sm:flex-row">
          <span className="flex items-center gap-2 font-semibold text-slate-600">
            <Zap className="h-4 w-4 text-brand-600" /> SpeedLead
          </span>
          <span>© {new Date().getFullYear()} SpeedLead. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
