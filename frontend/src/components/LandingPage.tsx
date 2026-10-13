import React, { useEffect, useState } from 'react';
import { FeatureMedia, VisualKind } from './LandingVisuals';

// =====================================================================
// ATITHI RMS — FIRST PAGE (shown before login)
// All the text is written directly below, so you can change it easily.
// The "Login" buttons open the normal login page.
//
// Images: put them in  frontend/public/products/
//   /products/atithi-rms.png          → big picture at the top
//   /products/athiti.png              → logo (used if the big picture is missing)
//   /products/atithi/dashboard.png …  → feature screenshots (if missing, a small drawing is shown)
// =====================================================================

// 🎊 Festive offer: true = show the offer, false = hide it
const FESTIVE_OFFER = true;

// WhatsApp number for all "Request a Demo" / plan buttons
const WHATSAPP = '9779828750115';
const wa = (text: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

// ---------------- small icons ----------------
type IconProps = { className?: string };
const ArrowRight = ({ className = 'w-4 h-4' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);
const ChevronDown = ({ className = 'w-4 h-4' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);
const CheckIcon = ({ className = 'w-4 h-4' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const BoltIcon = ({ className = 'w-5 h-5' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);
const LockIcon = ({ className = 'w-5 h-5' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);
const ChartIcon = ({ className = 'w-5 h-5' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const ScaleIcon = ({ className = 'w-5 h-5' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const MailIcon = ({ className = 'w-4 h-4' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const SparkIcon = ({ className = 'w-4 h-4' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

// ---------------- small building blocks (the text is passed in where they are used) ----------------
function SectionHeading({ eyebrow, title, subtitle, center = false }: { eyebrow: string; title: string; subtitle?: React.ReactNode; center?: boolean }) {
  return (
    <div className={`mb-10 ${center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}`}>
      <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-purple-700">
        <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
        {eyebrow}
      </span>
      <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#1e003a] lg:text-4xl">{title}</h2>
      {subtitle && <div className="mt-3 text-sm font-medium leading-relaxed text-slate-500 lg:text-base">{subtitle}</div>}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3.5 py-1.5 text-[11px] font-bold text-purple-800 ring-1 ring-inset ring-purple-100">
      <CheckIcon className="h-3 w-3 text-purple-600" />
      {children}
    </span>
  );
}

function StoryParagraph({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 flex gap-4 border-t border-slate-100 pt-6">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-purple-100 to-indigo-100 text-xs font-black text-purple-700">
        {n}
      </span>
      <p className="text-[15px] font-medium leading-relaxed text-slate-600 lg:text-base">{children}</p>
    </div>
  );
}

function FeatureCard({
  n,
  title,
  kind,
  image,
  tint,
  big = false,
  children,
}: {
  n: string;
  title: string;
  kind: VisualKind;
  image?: string;
  tint: string;
  big?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-[28px] border border-purple-100/70 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] transition-all duration-500 ease-out hover:-translate-y-1.5 hover:border-purple-200 hover:shadow-[0_28px_56px_-12px_rgba(147,51,234,0.22)] ${
        big ? 'sm:col-span-2 lg:flex-row' : ''
      }`}
    >
      <div
        className={`relative flex items-start justify-center overflow-hidden bg-linear-to-br ${tint} px-6 pt-8 ${
          big ? 'h-72 lg:h-auto lg:min-h-[340px] lg:w-[58%] lg:items-center lg:pb-8' : 'h-60'
        }`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(147,51,234,0.18) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-purple-400/15 blur-3xl" />
        <span className="absolute left-4 top-4 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-white/90 px-2 text-[10px] font-black text-purple-700 shadow-sm backdrop-blur">
          {n}
        </span>
        {big && (
          <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-linear-to-r from-purple-600 to-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-md">
            <SparkIcon className="h-3 w-3" />
            Core
          </span>
        )}
        <div className="relative w-full transition-transform duration-500 ease-out group-hover:-translate-y-2 group-hover:scale-[1.02]">
          <FeatureMedia kind={kind} title={title} image={image} wide={big} />
        </div>
        {!big && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-white/90 to-transparent" />}
      </div>

      <div className={`relative flex flex-col justify-center p-6 ${big ? 'lg:w-[42%] lg:p-9' : ''}`}>
        <h3 className={`font-black leading-snug text-[#1e003a] ${big ? 'text-xl lg:text-2xl' : 'text-base'}`}>{title}</h3>
        <div className={`mt-1.5 font-medium leading-relaxed text-slate-500 ${big ? 'text-sm lg:text-base' : 'text-[13px]'}`}>{children}</div>
      </div>
    </article>
  );
}

function PlanItem({ dark = false, children }: { dark?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-[#a3e635]/20 text-[#a3e635]' : 'bg-purple-100 text-purple-600'}`}>
        <CheckIcon className="h-3 w-3" />
      </span>
      <span className={`text-sm font-semibold leading-snug ${dark ? 'text-white/90' : 'text-slate-600'}`}>{children}</span>
    </li>
  );
}

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'key-features', label: 'Features' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'why-it-works', label: 'Why It Works' },
];

// =====================================================================
// PAGE
// =====================================================================
export default function LandingPage({ onLogin }: { onLogin: () => void }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [storyOpen, setStoryOpen] = useState(false);
  const [heroImg, setHeroImg] = useState('/products/atithi-rms.png');

  // Scroll progress bar + shadow under the top bar
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      setIsScrolled(window.scrollY > 24);
      const max = el.scrollHeight - el.clientHeight;
      setScrollProgress(max > 0 ? Math.min(window.scrollY / max, 1) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Which section is on screen (for the top tabs)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActiveSection(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main className="min-h-screen overflow-x-clip bg-white font-sans">
      {/* ==== Sticky top bar ==== */}
      <div
        className={`sticky top-0 z-40 bg-white/85 backdrop-blur-xl transition-shadow duration-300 ${
          isScrolled ? 'border-b border-purple-100 shadow-[0_8px_24px_-12px_rgba(76,29,149,0.18)]' : 'border-b border-transparent'
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-transparent">
          <div className="h-full bg-linear-to-r from-purple-600 via-violet-500 to-indigo-500 transition-[width] duration-150" style={{ width: `${scrollProgress * 100}%` }} />
        </div>

        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 lg:px-8">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex min-w-0 cursor-pointer items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-auto max-w-[90px] shrink-0 object-contain" />
            <span className="truncate text-sm font-extrabold text-[#1e003a]">Atithi RMS</span>
          </button>

          <nav aria-label="Page sections" className="hidden items-center gap-1 rounded-full border border-purple-100 bg-purple-50/70 p-1 md:flex">
            {SECTIONS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => scrollToSection(tab.id)}
                aria-current={activeSection === tab.id ? 'true' : undefined}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-black transition-all duration-200 ${
                  activeSection === tab.id
                    ? 'bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-sm shadow-purple-500/30'
                    : 'text-purple-700 hover:bg-white hover:text-purple-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <button
            onClick={onLogin}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-linear-to-r from-purple-600 to-indigo-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-purple-500/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97]"
          >
            Login
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Mobile section tabs */}
        <nav aria-label="Page sections" className="flex gap-1.5 overflow-x-auto px-4 pb-2.5 md:hidden [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => scrollToSection(tab.id)}
              className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-black transition-all ${
                activeSection === tab.id ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ==== Hero ==== */}
      <section className="relative overflow-hidden bg-linear-to-b from-[#f6eeff] via-[#fbf8ff] to-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(147,51,234,0.25) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'linear-gradient(to bottom, black 40%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent)',
          }}
        />
        <div className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-300/30 blur-[110px]" />
        <div className="pointer-events-none absolute -right-24 top-24 h-[380px] w-[380px] rounded-full bg-indigo-300/25 blur-[110px]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:pt-16">
          {/* Left: text */}
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white px-3.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-purple-700 shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                Hospitality Software
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                IRD Verified
              </span>
            </div>

            <h1 className="text-4xl font-black leading-[0.98] tracking-tight text-[#1e003a] lg:text-6xl">Atithi RMS</h1>
            <p className="mt-4 bg-linear-to-r from-purple-700 via-violet-600 to-indigo-600 bg-clip-text text-lg font-extrabold text-transparent lg:text-2xl">
              Restaurant Management, Simplified
            </p>
            <p className="mt-4 max-w-xl text-[15px] font-medium leading-relaxed text-slate-600 lg:text-base">
              A complete restaurant management system built to handle orders, tables, kitchen workflow, and billing — all from one clean dashboard.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={wa('Hello, I want Atithi RMS for my business. Could you please explain the system and available packages?')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-purple-500/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-purple-500/40 active:scale-[0.98]"
              >
                Request a Demo
                <ArrowRight />
              </a>
              <button
                onClick={() => scrollToSection('key-features')}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-purple-200 bg-white px-7 py-3.5 text-sm font-bold text-purple-700 shadow-xs transition-all hover:border-purple-300 hover:bg-purple-50 active:scale-[0.98]"
              >
                Explore features
              </button>
            </div>

            {/* Quick facts */}
            <dl className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-purple-100 rounded-2xl border border-purple-100 bg-white/80 shadow-xs backdrop-blur">
              <div className="px-3 py-3 sm:px-4">
                <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Features</dt>
                <dd className="mt-0.5 text-lg sm:text-xl font-black text-[#1e003a]">13 +</dd>
              </div>
              <div className="px-3 py-3 sm:px-4">
                <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">Free trial</dt>
                <dd className="mt-0.5 truncate text-lg sm:text-xl font-black text-[#1e003a]">30 days</dd>
              </div>
              <div className="px-3 py-3 sm:px-4">
                <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">From</dt>
                <dd className="mt-0.5 truncate text-lg sm:text-xl font-black text-purple-700">Rs 11,111</dd>
              </div>
            </dl>
          </div>

          {/* Right: product picture */}
          <div className="relative flex w-full justify-center">
            <div className="absolute -inset-10 rounded-[56px] bg-linear-to-br from-purple-400/35 via-violet-300/30 to-indigo-300/35 blur-3xl" />
            <div className="relative w-full overflow-hidden rounded-3xl bg-white shadow-[0_60px_120px_-20px_rgba(76,29,149,0.45)] ring-1 ring-purple-900/10 lg:w-[120%] lg:-ml-[10%]">
              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-rose-300" />
                <span className="h-3 w-3 rounded-full bg-amber-300" />
                <span className="h-3 w-3 rounded-full bg-emerald-300" />
                <span className="ml-3 flex-1 truncate rounded-md bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-400 ring-1 ring-slate-100">
                  atithi.cornortech.com
                </span>
              </div>
              <div className="relative flex w-full items-center justify-center bg-slate-950">
                <img
                  src={heroImg}
                  alt="Atithi RMS preview"
                  className={heroImg === '/products/atithi-rms.png' ? 'block h-auto w-full object-contain' : 'my-16 max-h-36 max-w-[70%] object-contain'}
                  onError={() => setHeroImg((cur) => (cur === '/products/atithi-rms.png' ? '/products/athiti.png' : '/logo.png'))}
                />
              </div>
            </div>

            <div className="absolute -left-4 top-8 z-20 hidden rounded-2xl border border-purple-100 bg-white/95 px-4 py-3 shadow-2xl shadow-purple-900/15 backdrop-blur sm:block lg:-left-16">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Built for</p>
              <p className="text-sm font-black text-[#1e003a]">Order &amp; KOT Management</p>
            </div>
            <div className="absolute -bottom-6 -right-2 z-20 hidden items-center gap-3 rounded-2xl border border-emerald-100 bg-white/95 px-4 py-3 shadow-2xl shadow-emerald-900/15 backdrop-blur sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <BoltIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Real time</p>
                <p className="text-sm font-black text-[#1e003a]">Stock Tracking</p>
              </div>
            </div>
          </div>
        </div>

        {/* Highlights strip */}
        <div className="relative border-y border-purple-100 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-6 py-4 lg:px-8">
            <Chip>Order &amp; KOT Management</Chip>
            <Chip>Table Management</Chip>
            <Chip>Menu Management</Chip>
            <Chip>Kitchen Display System</Chip>
            <Chip>Order Tracking</Chip>
            <Chip>Billing &amp; VAT</Chip>
            <Chip>Staff Roles</Chip>
            <Chip>Stock Tracking</Chip>
          </div>
        </div>
      </section>

      {/* ==== Body ==== */}
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 lg:px-8 lg:pt-24">
        {/* ==== Overview ==== */}
        <section id="overview" className="mb-28 scroll-mt-32">
          <SectionHeading eyebrow="Overview" title="What Atithi RMS does for you" subtitle="The full picture, in plain words." />

          <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-8">
              <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-[0_4px_30px_rgba(15,23,42,0.04)] lg:p-10">
                <p className="text-lg font-semibold leading-relaxed text-slate-800 lg:text-xl">
                  <span className="float-left mr-3 mt-1 text-5xl font-black leading-[0.8] text-purple-600 lg:text-6xl">A</span>
                  tithi RMS is designed for restaurants, cafes, and hotels that want to move away from paper-based order taking and disconnected billing systems. From the moment an order is placed at the table to when the kitchen prepares it and the final bill is generated, Atithi RMS keeps every step connected and visible in real time.
                </p>

                <StoryParagraph n="01">
                  At the center of the system is a live dashboard that gives managers an instant snapshot of the business through clear, straightforward numbers — today's revenue and today's total sales, alongside lifetime totals for revenue and orders. So if you've been using the system for 3 days, the dashboard reflects the combined revenue and orders across all 3 days, not just today, giving owners a clear picture of overall performance at any moment. A dedicated Total Sales view breaks this down further, showing daily sales figures with the option to print a daily sales report for accounting or record-keeping.
                </StoryParagraph>

                <StoryParagraph n="02">
                  On the floor, Table Management gives staff a visual layout of every table, color-coded as Available, Occupied, Reserved, or Out of Service, with statuses updating instantly as guests are seated or leave. Orders are built through Create Order by browsing the menu and adding items in a few taps, and every order — whether being prepared, ready, or served — is visible in real time through Order Tracking. The moment an order is placed, it appears on the Kitchen Display, so the chef always knows what to prepare next, and can mark dishes as ready the instant they're done cooking, keeping the kitchen and the floor perfectly in sync.
                </StoryParagraph>

                {storyOpen && (
                  <>
                    <StoryParagraph n="03">
                      Billing is just as streamlined. Staff can generate itemized bills instantly through Create Bill, or save a bill as Pending if payment isn't settled right away — so nothing gets lost or forgotten while a customer steps out or a group decides how to split the cost. Every bill generated is stored permanently in Billing &amp; VAT Audit, giving owners a complete, searchable record for accounting and VAT purposes. Behind the scenes, Stock Management lets the team track ingredient and supply levels for the restaurant or cafe, helping avoid running out of popular items mid-shift, while Menu Management makes it easy to add, update, or remove dishes as the menu evolves.
                    </StoryParagraph>

                    <StoryParagraph n="04">
                      Atithi RMS also supports full staff role management. Only the manager can access Staff Management to create accounts for waiters, kitchen staff, and cashiers, and each role is limited to only the pages relevant to their job — keeping operations secure and every team member focused on their own responsibilities. A Settings page rounds out the system, letting owners manage restaurant details, update login credentials, and adjust other preferences whenever needed.
                    </StoryParagraph>

                    <StoryParagraph n="05">
                      Whether you're running a single outlet or managing multiple branches, Atithi RMS scales with your business, giving owners the tools to reduce order errors, speed up table turnover, and understand exactly where their revenue is coming from.
                    </StoryParagraph>
                  </>
                )}

                <div className="relative mt-6">
                  {!storyOpen && <div className="pointer-events-none absolute -top-24 left-0 right-0 h-24 bg-linear-to-t from-white to-transparent" />}
                  <button
                    onClick={() => setStoryOpen((o) => !o)}
                    aria-expanded={storyOpen}
                    className="mx-auto flex cursor-pointer items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-5 py-2.5 text-xs font-black text-purple-700 transition hover:bg-purple-100 active:scale-[0.97]"
                  >
                    {storyOpen ? 'Show less' : 'Read the full story (3 more)'}
                    <ChevronDown className={`h-4 w-4 transition-transform ${storyOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            <aside className="lg:col-span-4">
              <div className="space-y-4 lg:sticky lg:top-28">
                <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#1e003a] via-[#2d0a52] to-[#3b1266] p-6 shadow-xl shadow-purple-950/15 lg:p-7">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border border-white/10" />
                  <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">
                    <BoltIcon className="h-3.5 w-3.5" />
                    Built for
                  </p>
                  <p className="text-sm font-bold leading-relaxed text-white">
                    A complete restaurant management system built to handle orders, tables, kitchen workflow, and billing — all from one clean dashboard.
                  </p>
                  <div className="my-5 h-px bg-white/10" />
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">Category</p>
                  <span className="inline-block rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">Hospitality Software</span>
                </div>

                <div className="rounded-3xl border border-purple-100 bg-purple-50/50 p-6 lg:p-7">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-purple-700">Plans</p>
                  <ul className="space-y-2">
                    <li className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-purple-100">
                      <span className="font-bold text-slate-700">Demo</span>
                      <span className="font-black text-purple-700">Free</span>
                    </li>
                    <li className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-purple-100">
                      <span className="font-bold text-slate-700">Premium</span>
                      <span className="font-black text-purple-700">NPR 11,111</span>
                    </li>
                    <li className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-purple-100">
                      <span className="font-bold text-slate-700">Enterprise</span>
                      <span className="font-black text-purple-700">Custom</span>
                    </li>
                  </ul>
                  <button onClick={() => scrollToSection('pricing')} className="mt-3 w-full cursor-pointer text-center text-xs font-black text-purple-700 hover:text-purple-900">
                    Compare plans
                  </button>
                </div>

                <button
                  onClick={onLogin}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-purple-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
                >
                  Login to Atithi RMS
                  <ArrowRight />
                </button>
              </div>
            </aside>
          </div>
        </section>

        {/* ==== Key Features ==== */}
        <section id="key-features" className="mb-28 scroll-mt-32">
          <SectionHeading
            eyebrow="Key features"
            title="Everything you need, in one clean system"
            subtitle="13 features working together, so your team spends less time on admin and more time on customers."
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard n="01" big title="Dashboard" kind="dashboard" image="/products/atithi/dashboard.png" tint="from-[#f3e8ff] via-[#faf5ff] to-white">
              View today's revenue, today's total sales, and lifetime totals for revenue and orders.
              <div className="mt-5 flex flex-wrap gap-1.5">
                <span className="rounded-lg bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">Order &amp; KOT Management</span>
                <span className="rounded-lg bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">Table Management</span>
                <span className="rounded-lg bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">Menu Management</span>
              </div>
            </FeatureCard>

            <FeatureCard n="02" title="Total Sales" kind="sales" image="/products/atithi/total-sales.png" tint="from-[#e0e7ff] via-[#eef2ff] to-white">
              View daily sales summaries and print daily sales reports at any time.
            </FeatureCard>

            <FeatureCard n="03" title="Pending Bills" kind="pending" image="/products/atithi/pending-bills.png" tint="from-[#fce7f3] via-[#fdf2f8] to-white">
              Save any bill as pending and come back to complete it later without losing order details.
            </FeatureCard>

            <FeatureCard n="04" title="Create Bill" kind="bill" image="/products/atithi/create-bill.png" tint="from-[#dcfce7] via-[#f0fdf4] to-white">
              Generate accurate, itemized bills quickly for any table or order.
            </FeatureCard>

            <FeatureCard n="05" title="Kitchen Display (KOT)" kind="kitchen" image="/products/atithi/kot.png" tint="from-[#fef3c7] via-[#fffbeb] to-white">
              New orders appear instantly for the chef to prepare, and can be marked ready once cooking is complete.
            </FeatureCard>

            <FeatureCard n="06" title="Table Management" kind="tables" image="/products/atithi/tables.png" tint="from-[#e0f2fe] via-[#f0f9ff] to-white">
              Track every table as Available, Occupied, Reserved, or Out of Service.
            </FeatureCard>

            <FeatureCard n="07" title="Create Order" kind="order" image="/products/atithi/create-order.png" tint="from-[#f3e8ff] via-[#faf5ff] to-white">
              Browse the menu and create a new order in just a few taps.
            </FeatureCard>

            <FeatureCard n="08" title="Order Tracking" kind="tracking" image="/products/atithi/order-tracking.png" tint="from-[#e0e7ff] via-[#eef2ff] to-white">
              See every order at a glance, whether it is being prepared, ready, or already served.
            </FeatureCard>

            <FeatureCard n="09" title="Menu Management" kind="menu" image="/products/atithi/menu-management.png" tint="from-[#fce7f3] via-[#fdf2f8] to-white">
              Add, update, delete, and view menu items with full control over pricing.
            </FeatureCard>

            <FeatureCard n="10" title="Stock Management" kind="stock" image="/products/atithi/stock-management.png" tint="from-[#dcfce7] via-[#f0fdf4] to-white">
              Record and track stock levels for your restaurant or cafe ingredients.
            </FeatureCard>

            <FeatureCard n="11" title="Billing & VAT Audit" kind="audit" image="/products/atithi/vat-audit.png" tint="from-[#fef3c7] via-[#fffbeb] to-white">
              View a complete record of every bill generated, ready for accounting.
            </FeatureCard>

            <FeatureCard n="12" title="Staff Management" kind="staff" image="/products/atithi/staff.png" tint="from-[#e0f2fe] via-[#f0f9ff] to-white">
              Managers can create accounts for waiters, kitchen staff, and cashiers.
            </FeatureCard>

            <FeatureCard n="13" title="Settings" kind="settings" image="/products/atithi/settings.png" tint="from-[#f3e8ff] via-[#faf5ff] to-white">
              Manage restaurant details, update your ID and password, and configure preferences.
            </FeatureCard>
          </div>
        </section>

        {/* ==== Pricing ==== */}
        <section id="pricing" className="mb-28 scroll-mt-32">
          <SectionHeading
            eyebrow="Pricing"
            title="Simple pricing, built to scale with you"
            subtitle={
              <>
                Try it risk-free, then pick the plan that fits. <span className="font-semibold text-purple-600">Paid plans are shown excluding VAT.</span>
              </>
            }
          />

          {FESTIVE_OFFER && (
            <div className="mb-10 flex items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-linear-to-r from-orange-50 via-rose-50 to-pink-50 px-5 py-3 text-center text-sm font-black text-rose-600">
              <span className="animate-bounce">🎊</span>
              Festive Offer is live. Get Premium at a special discounted price for a limited time.
              <span className="animate-bounce">🎊</span>
            </div>
          )}

          <div className="grid items-stretch gap-6 lg:grid-cols-3">
            {/* ---------- Plan 1: Demo ---------- */}
            <div className="relative flex flex-col rounded-3xl border border-slate-100 bg-white p-7 shadow-[0_4px_24px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-purple-200 hover:shadow-[0_16px_36px_-12px_rgba(147,51,234,0.18)] lg:p-8">
              <span className="absolute -top-3.5 left-7 rounded-full border border-purple-200 bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-purple-700 shadow-md">
                30-Day Trial
              </span>
              <p className="relative mb-5 mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Demo</p>
              <div className="relative mb-1 flex flex-wrap items-end gap-2">
                <span className="text-3xl font-black leading-none tracking-tight text-[#1e003a] lg:text-4xl">Free</span>
              </div>
              <div className="relative mb-6 flex min-h-[24px] flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400">30-day trial</span>
              </div>
              <p className="relative mb-6 text-sm font-medium leading-relaxed text-slate-500">
                Full access to every feature so you can test it on the floor before you commit.
              </p>
              <div className="relative mb-6 h-px bg-slate-100" />
              <ul className="relative mb-8 flex-1 space-y-3">
                <PlanItem>All features unlocked</PlanItem>
                <PlanItem>Live Business Dashboard</PlanItem>
                <PlanItem>Total Sales &amp; Revenue Analytics</PlanItem>
                <PlanItem>Pending Bills &amp; Order Hold Management</PlanItem>
                <PlanItem>Instant Bill Generation</PlanItem>
                <PlanItem>Kitchen Display System (KOT)</PlanItem>
                <PlanItem>Visual Table Management</PlanItem>
                <PlanItem>Fast Order Creation</PlanItem>
                <PlanItem>Real-Time Order Tracking</PlanItem>
                <PlanItem>Dynamic Menu Management</PlanItem>
                <PlanItem>Stock &amp; Inventory Tracking</PlanItem>
                <PlanItem>Billing &amp; VAT Audit Logs</PlanItem>
                <PlanItem>Role-Based Staff Management</PlanItem>
                <PlanItem>System &amp; Outlet Settings</PlanItem>
                <PlanItem>Unlimited Test Orders</PlanItem>
              </ul>
              <a
                href={wa('Hello, I\'m interested in the "Demo" plan for Atithi RMS. Could you please provide the details and help me get started?')}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex w-full items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-6 py-3.5 text-sm font-black text-purple-700 transition-all hover:border-transparent hover:bg-linear-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white active:scale-[0.98]"
              >
                Start Free Demo
                <ArrowRight />
              </a>
            </div>

            {/* ---------- Plan 2: Premium (dark, highlighted) ---------- */}
            <div className="relative flex flex-col rounded-3xl border border-purple-400/30 bg-linear-to-br from-[#1e003a] via-[#2d0a52] to-[#3b1266] p-7 shadow-2xl shadow-purple-950/25 transition-all duration-300 lg:-translate-y-3 lg:p-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl" />

              {FESTIVE_OFFER && (
                <span className="absolute -top-3.5 right-7 z-10 inline-flex items-center gap-1.5 rounded-full bg-linear-to-r from-orange-500 via-rose-500 to-pink-500 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-rose-500/40">
                  <span className="animate-pulse">🎉</span>
                  Festive Offer
                </span>
              )}
              <span className="absolute -top-3.5 left-7 rounded-full bg-[#a3e635] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#1e003a] shadow-md">
                Top Choice
              </span>

              <p className="relative mb-5 mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-purple-300">Premium</p>
              <div className="relative mb-1 flex flex-wrap items-end gap-2">
                {FESTIVE_OFFER && <span className="text-base font-bold text-white/40 line-through decoration-2">NPR 20,000</span>}
                <span className="text-3xl font-black leading-none tracking-tight text-white lg:text-4xl">NPR 11,111</span>
              </div>
              <div className="relative mb-6 flex min-h-[24px] flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-purple-200">/ year</span>
                <span className="rounded-md border border-purple-400/20 bg-purple-500/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-200">
                  Excluding 13% VAT
                </span>
              </div>

              {FESTIVE_OFFER && (
                <div className="relative mb-5 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#a3e635]">You save</p>
                    <p className="text-lg font-black leading-tight text-white">NPR 8,889</p>
                  </div>
                  <span className="rounded-xl bg-linear-to-br from-orange-400 to-rose-500 px-3 py-1.5 text-sm font-black text-white shadow-md shadow-rose-500/30">44% OFF</span>
                </div>
              )}

              <p className="relative mb-6 text-sm font-medium leading-relaxed text-purple-100/90">
                Everything a growing restaurant or multi-branch outlet needs to run at full speed.
              </p>
              <div className="relative mb-6 h-px bg-white/10" />
              <ul className="relative mb-8 flex-1 space-y-3">
                <PlanItem dark>Unlimited staff accounts</PlanItem>
                <PlanItem dark>Live Business Dashboard</PlanItem>
                <PlanItem dark>Total Sales &amp; Revenue Analytics</PlanItem>
                <PlanItem dark>Pending Bills &amp; Order Hold Management</PlanItem>
                <PlanItem dark>Instant Bill Generation</PlanItem>
                <PlanItem dark>Kitchen Display System (KOT)</PlanItem>
                <PlanItem dark>Visual Table Management</PlanItem>
                <PlanItem dark>Fast Order Creation</PlanItem>
                <PlanItem dark>Real-Time Order Tracking</PlanItem>
                <PlanItem dark>Dynamic Menu Management</PlanItem>
                <PlanItem dark>Stock &amp; Inventory Tracking</PlanItem>
                <PlanItem dark>Billing &amp; VAT Audit Logs</PlanItem>
                <PlanItem dark>Role-Based Staff Management</PlanItem>
                <PlanItem dark>System &amp; Outlet Settings</PlanItem>
                <PlanItem dark>Unlimited Test Orders</PlanItem>
                <PlanItem dark>Priority support</PlanItem>
              </ul>
              <a
                href={wa('Hello, I\'m interested in the "Premium" plan for Atithi RMS. Could you please provide the details and help me get started?')}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-black text-[#3c2f80] shadow-lg shadow-black/20 transition-all hover:bg-slate-100 active:scale-[0.98]"
              >
                Upgrade to Premium
                <ArrowRight />
              </a>
            </div>

            {/* ---------- Plan 3: Enterprise ---------- */}
            <div className="relative flex flex-col rounded-3xl border border-slate-100 bg-white p-7 shadow-[0_4px_24px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-purple-200 hover:shadow-[0_16px_36px_-12px_rgba(147,51,234,0.18)] lg:p-8">
              <span className="absolute -top-3.5 left-7 rounded-full border border-purple-200 bg-white px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-purple-700 shadow-md">
                Multi-Branch &amp; Chains
              </span>
              <p className="relative mb-5 mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Enterprise</p>
              <div className="relative mb-1 flex flex-wrap items-end gap-2">
                <span className="text-base font-bold text-slate-400 line-through decoration-2">Tailored Quote</span>
                <span className="text-3xl font-black leading-none tracking-tight text-[#1e003a] lg:text-4xl">Custom</span>
              </div>
              <div className="relative mb-6 flex min-h-[24px] flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400">/ custom billing</span>
                <span className="rounded-md border border-slate-200/60 bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Excluding 13% VAT
                </span>
              </div>
              <p className="relative mb-6 text-sm font-medium leading-relaxed text-slate-500">
                Custom solutions for large restaurant chains, franchises, and multi-location hospitality brands requiring dedicated infrastructure and SLAs.
              </p>
              <div className="relative mb-6 h-px bg-slate-100" />
              <ul className="relative mb-8 flex-1 space-y-3">
                <PlanItem>Everything in Premium, plus:</PlanItem>
                <PlanItem>Multi-Branch Central Management</PlanItem>
                <PlanItem>Franchise &amp; Chain Operations Dashboard</PlanItem>
                <PlanItem>Centralized Menu &amp; Price Push</PlanItem>
                <PlanItem>Central Warehouse &amp; Stock Transfers</PlanItem>
                <PlanItem>Custom API &amp; ERP/Accounting Integrations</PlanItem>
                <PlanItem>Custom Role &amp; Granular Security Scopes</PlanItem>
                <PlanItem>Advanced Business Intelligence &amp; Custom Reports</PlanItem>
                <PlanItem>Dedicated Account Manager</PlanItem>
                <PlanItem>24/7 Priority SLA &amp; Phone Support</PlanItem>
                <PlanItem>On-site Staff Onboarding &amp; Training</PlanItem>
                <PlanItem>Private Cloud or Custom Deployment</PlanItem>
              </ul>
              <a
                href={wa("Hello, I'm interested in a custom Enterprise version of Atithi RMS for my business. Could you please discuss the available options and pricing?")}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex w-full items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-6 py-3.5 text-sm font-black text-purple-700 transition-all hover:border-transparent hover:bg-linear-to-r hover:from-purple-600 hover:to-indigo-600 hover:text-white active:scale-[0.98]"
              >
                Contact Enterprise Sales
                <ArrowRight />
              </a>
            </div>
          </div>
        </section>

        {/* ==== Why It Works ==== */}
        <section id="why-it-works" className="relative mb-28 scroll-mt-32">
          <div className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-96 w-3/4 -translate-x-1/2 rounded-full bg-linear-to-b from-purple-200/40 via-purple-100/20 to-transparent blur-3xl" />

          <SectionHeading
            center
            eyebrow="Why it works"
            title="Engineered for speed, built for complete control"
            subtitle="See how Atithi RMS keeps operations smooth, even at your busiest hours."
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-12">
            {/* Fast */}
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-purple-100 bg-linear-to-br from-white via-purple-50/40 to-purple-100/50 p-8 shadow-[0_10px_30px_rgba(147,51,234,0.05)] transition-all duration-300 hover:border-purple-300 hover:shadow-[0_20px_40px_rgba(147,51,234,0.12)] lg:col-span-7">
              <div className="relative z-10 mb-8 max-w-md">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30 transition-transform group-hover:scale-110">
                  <BoltIcon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-2xl font-black text-slate-900">Fast and reliable</h3>
                <p className="text-sm font-medium leading-relaxed text-slate-600">
                  No lag at peak hours. Every action syncs across all your devices the moment it happens.
                </p>
              </div>
              <div className="relative z-10 rounded-2xl border border-purple-100/80 bg-white/90 p-5 shadow-md backdrop-blur-md">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">Sync speed</span>
                  </div>
                  <span className="rounded-md border border-purple-100 bg-purple-50 px-2.5 py-1 text-xs font-black text-purple-700">Near instant</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[92%] rounded-full bg-linear-to-r from-purple-500 to-indigo-500 transition-all duration-1000 group-hover:w-full" />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span>Every device updated</span>
                  <span>Every change saved</span>
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-12 -right-12 h-64 w-64 rounded-full bg-purple-300/20 blur-3xl" />
            </div>

            {/* Secure */}
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.03)] transition-all duration-300 hover:border-purple-300 hover:shadow-[0_20px_40px_rgba(147,51,234,0.12)] lg:col-span-5">
              <div>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-100 bg-purple-50 text-purple-600 transition-all group-hover:bg-purple-600 group-hover:text-white">
                  <LockIcon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-black text-slate-900">Role-based security</h3>
                <p className="mb-6 text-sm font-medium leading-relaxed text-slate-500">
                  Each person sees only what they need, which protects your revenue and your records.
                </p>
              </div>
              <div className="space-y-2.5 rounded-2xl border border-purple-100/60 bg-purple-50/50 p-4">
                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3.5 py-2 text-xs font-bold shadow-xs">
                  <span className="text-slate-700">Manager / Admin</span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-600">Full access</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/70 px-3.5 py-2 text-xs font-bold text-slate-500">
                  <span>Staff</span>
                  <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-black uppercase text-purple-600">Their pages only</span>
                </div>
              </div>
            </div>

            {/* Live */}
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.03)] transition-all duration-300 hover:border-purple-300 hover:shadow-[0_20px_40px_rgba(147,51,234,0.12)] lg:col-span-5">
              <div>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-100 bg-purple-50 text-purple-600 transition-all group-hover:bg-purple-600 group-hover:text-white">
                  <ChartIcon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-black text-slate-900">Live numbers, anywhere</h3>
                <p className="mb-6 text-sm font-medium leading-relaxed text-slate-500">
                  Check how the day is going from any device, without waiting for a report.
                </p>
              </div>
              <div className="rounded-2xl bg-linear-to-r from-purple-700 to-indigo-700 p-4 text-white shadow-lg">
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-purple-200">Revenue</div>
                <div className="flex items-center justify-between text-2xl font-black tracking-tight">
                  <span>NPR 48.2k</span>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/20 px-2 py-0.5 text-xs font-bold text-emerald-200">+18.4%</span>
                </div>
              </div>
            </div>

            {/* Scale */}
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-100 bg-linear-to-br from-white via-purple-50/30 to-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.03)] transition-all duration-300 hover:border-purple-300 hover:shadow-[0_20px_40px_rgba(147,51,234,0.12)] lg:col-span-7">
              <div className="relative z-10 mb-6 max-w-md">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-100 bg-purple-50 text-purple-600 transition-all group-hover:bg-purple-600 group-hover:text-white">
                  <ScaleIcon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-2xl font-black text-slate-900">Grows with your business</h3>
                <p className="text-sm font-medium leading-relaxed text-slate-500">
                  Start with one location today and add more later, without moving data or retraining staff.
                </p>
              </div>
              <div className="relative z-10 grid gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-white p-3 shadow-xs">
                  <span className="h-3 w-3 rounded-full bg-purple-600" />
                  <div>
                    <div className="text-xs font-black text-slate-800">Butwal</div>
                    <div className="text-[10px] font-bold text-emerald-600">Active</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <span className="h-3 w-3 rounded-full bg-slate-300" />
                  <div>
                    <div className="text-xs font-bold text-slate-500">Kathmandu</div>
                    <div className="text-[10px] font-bold text-slate-400">Synced</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <span className="h-3 w-3 rounded-full bg-slate-300" />
                  <div>
                    <div className="text-xs font-bold text-slate-500">Pokhara</div>
                    <div className="text-[10px] font-bold text-slate-400">Synced</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==== Get started ==== */}
        <section
          id="get-started"
          className="relative overflow-hidden rounded-[32px] border border-purple-500/30 bg-linear-to-br from-[#1e003a] via-[#2d0a52] to-[#3b1266] p-8 shadow-2xl shadow-purple-950/30 sm:p-12 lg:p-16"
        >
          <div className="pointer-events-none absolute right-0 top-0 -mr-12 -mt-12 h-96 w-96 rounded-full bg-[#9333EA]/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 -mb-12 -ml-12 h-96 w-96 rounded-full bg-[#a3e635]/10 blur-3xl" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '26px 26px' }}
          />

          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-[#a3e635] backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#a3e635]" />
              Start risk-free today
            </span>

            <h2 className="mb-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">Ready to make work easier?</h2>

            <p className="mb-8 max-w-xl text-sm font-medium leading-relaxed text-purple-100/80 sm:text-base lg:text-lg">
              Start with <span className="font-black text-white underline decoration-purple-400 decoration-2 underline-offset-4">Atithi RMS</span> today and make service smoother for your team and customers.
            </p>

            <div className="mb-8 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
              <button
                onClick={onLogin}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-sm font-black text-[#1e003a] shadow-xl shadow-black/20 transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100 active:scale-[0.98] sm:w-auto"
              >
                Start your 30 day trial
                <ArrowRight />
              </button>
              <a
                href={`mailto:info@cornortech.com?subject=${encodeURIComponent('Live demo request: Atithi RMS')}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-8 py-4 text-sm font-bold text-white backdrop-blur-md transition-all duration-300 hover:bg-white/15 sm:w-auto"
              >
                <MailIcon />
                Book a live demo
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-purple-200/90">
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-[#a3e635]" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-[#a3e635]" />
                <span>Quick setup</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-[#a3e635]" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ==== Footer ==== */}
      <footer className="border-t border-purple-100 bg-[#fbf8ff]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs font-semibold text-slate-500 sm:flex-row lg:px-8">
          <span>© {new Date().getFullYear()} Cornor Tech Pvt. Ltd. — Atithi RMS</span>
          <div className="flex items-center gap-4">
            <a href="mailto:info@cornortech.com" className="hover:text-purple-700">info@cornortech.com</a>
            <a href="https://cornortech.com" target="_blank" rel="noopener noreferrer" className="hover:text-purple-700">cornortech.com</a>
          </div>
        </div>
      </footer>
    </main>
  );
}