"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NAVY = "#070B1E";
const INK = "#0B1230";
const MINT = "#7BF1C0";
const BLUE = "#2F6BFF";

const STATS = [
  { value: "3×", label: "Faster document intake" },
  { value: "90%", label: "Fewer manual classification checks" },
  { value: "100%", label: "Original files SHA-256 hashed" },
  { value: "<20 sec", label: "Per document, end to end" },
];

const EVIDENCE_PILLS = [
  "AICTE application form",
  "Land ownership",
  "Fire safety NOC",
  "Faculty list",
  "Bank statement",
  "Affidavit",
  "Passport / identity",
  "Infrastructure photos",
];

const INTAKE_PROBLEMS = [
  {
    title: "Missing required evidence",
    body: "Every bundle is reconciled against a versioned checklist, so a missing land record or signatory authority is caught before a reviewer ever opens the file.",
  },
  {
    title: "Duplicates & reused documents",
    body: "Byte-identical uploads are grouped by SHA-256 and near-identical page images by perceptual hash. Both are surfaced as indicators for a human — never as a verdict.",
  },
  {
    title: "Unreadable or rotated scans",
    body: "Every page reports whether text came from the PDF text layer or OCR, its confidence and its quality flags. Blank pages and failed extraction stay distinguishable.",
  },
];

const CAPABILITIES = [
  {
    icon: "shield",
    title: "Any permitted bundle. Total privacy.",
    body: "PDF, JPG, PNG and ZIP archives are validated by file signature, stored privately with generated names and hashed. Documents are never exposed on a public URL.",
  },
  {
    icon: "list",
    title: "Explainable outcomes, not risk scores.",
    body: "Each classification records the matched phrases, rule version and confidence band. Ambiguous documents go to a review queue instead of being silently accepted.",
  },
  {
    icon: "spark",
    title: "Decisions that match your checklist.",
    body: "Requirements live in a versioned configuration with a source reference and a provisional flag — never invented from memory, and never identical across categories by assumption.",
  },
  {
    icon: "clock",
    title: "Resumable, idempotent processing.",
    body: "Uploads, extractions and corrections persist in PostgreSQL. Retry a failed document or reload the page: the interface reflects stored state, not optimistic UI.",
  },
];

const STEPS = [
  {
    title: "Validate",
    body: "Signature, size, archive safety and PDF encryption are checked before anything is stored.",
    time: "less than 3 seconds",
  },
  {
    title: "Classify",
    body: "Text and layout cues assign one of the intake document types with matched-phrase evidence.",
    time: "less than 4 seconds",
  },
  {
    title: "Reconcile",
    body: "Documents are compared with the versioned checklist and duplicate / quality signals are attached.",
    time: "less than 20 seconds",
  },
  {
    title: "Decide readiness",
    body: "You get a clear intake state — ready, needs review or blocked — with the reasons spelled out.",
    time: "immediately",
  },
];

const USE_CASES = [
  {
    title: "New institutional applications",
    body: "Create an application, upload the full bundle and see intake readiness before scrutiny begins.",
  },
  {
    title: "Extension of Approval",
    body: "Reconcile renewal bundles against the document checklist configured for the academic year.",
  },
  {
    title: "Faculty & qualification evidence",
    body: "Identify faculty lists, count pages and route uncertain classifications to a reviewer.",
  },
  {
    title: "Land & infrastructure",
    body: "Land records, completion certificates and photograph bundles with duplicate detection.",
  },
  {
    title: "Bank & financial statements",
    body: "Financial evidence is classified, page-counted and flagged when the scan is unreadable.",
  },
  {
    title: "Affidavits & identity",
    body: "Affidavits, signatory authority and passport scans are separated from the rest of the bundle.",
  },
];

const FAQS = [
  {
    q: "What does Module 1 actually do?",
    a: "It takes an application bundle end to end through intake: upload and validation, private storage, normalization, text/OCR extraction, document classification, page quality and duplicate analysis, checklist reconciliation, human correction, an intake manifest and a downloadable report. It determines intake readiness only.",
  },
  {
    q: "Is this the same as verifying a government document?",
    a: "No. Classification is an intake aid. Nothing in Module 1 claims a certificate is authentic, genuine or compliant, and no application is ever described as verified or fraud-free at this stage.",
  },
  {
    q: "Which file formats are accepted?",
    a: "PDF, JPG/JPEG and PNG documents, individually or inside a ZIP archive. Signatures are inspected, encrypted PDFs are rejected with an explanation, and ZIP archives are protected against path traversal, symlinks, nested archives and decompression bombs.",
  },
  {
    q: "What happens when the classifier is unsure?",
    a: "Results below the auto-accept threshold enter a review queue. You can confirm or change the document type, and the original prediction, the correction, the reviewer, the timestamp and the reason are all recorded.",
  },
  {
    q: "Does it need an internet model or a third-party service?",
    a: "No. Text extraction uses PyMuPDF, OCR uses a local RapidOCR model, and classification is an explainable rule engine. Everything runs on the local stack and each step records a processor version.",
  },
  {
    q: "Can I resume a partly processed bundle?",
    a: "Yes. Every stage is persisted and processing is idempotent. Reload the application, retry a failed document, or correct a classification and regenerate the manifest — the previous manifest version is preserved.",
  },
];

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
    list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
    clock: <path d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    lock: <path d="M6 10V8a6 6 0 1112 0v2m-9 0h6a2 2 0 012 2v7a2 2 0 01-2 2H9a2 2 0 01-2-2v-7a2 2 0 012-2z" />,
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}

function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: dark ? INK : "#E8EDFF" }}>
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" width="18" height="18" fill="none" stroke={dark ? MINT : BLUE} strokeWidth="2.2">
          <path d="M5 19L19 5M5 5l14 14" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight" style={{ color: dark ? "#fff" : "#0B1230" }}>
        Resilient AI <span style={{ color: dark ? MINT : BLUE }}>X ShadeX</span>
      </span>
    </Link>
  );
}

export default function LandingPage() {
  const [showPlayer, setShowPlayer] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPlayer(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-screen scroll-smooth" style={{ background: NAVY, color: "#E9EDF9" }}>
      {/* ---------------------------------------------------------------- header */}
      <header className="fixed inset-x-0 top-4 z-40 px-4">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-2xl bg-white px-5 shadow-[0_10px_40px_rgba(3,7,25,0.35)]">
          <BrandMark />
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-95"
            style={{ background: MINT, color: "#06231A" }}
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------------------- hero */}
      <section id="top" className="relative overflow-hidden pt-32">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage: "url(/landing/neural.webp)",
            backgroundSize: "cover",
            backgroundPosition: "center right",
          }}
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(90deg, ${NAVY} 12%, rgba(7,11,30,0.86) 46%, rgba(7,11,30,0.45) 100%)` }} />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-[13px] font-medium" style={{ color: "#7EA6FF" }}>
              Evidence-first intake for AICTE applications
            </p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[58px]">
              Validate any
              <br />
              application bundle
              <br />
              from any institution
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-7" style={{ color: "#AEB9D6" }}>
              Screen missing, unreadable, duplicated and misclassified documents in seconds. Module 1
              turns a raw upload into a reviewable intake manifest — with evidence for every outcome.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="rounded-lg px-5 py-3 text-sm font-semibold transition hover:brightness-95"
                style={{ background: MINT, color: "#06231A" }}
              >
                Get Started
              </Link>
              <button
                onClick={() => document.getElementById("watch")?.scrollIntoView({ behavior: "smooth" })}
                className="flex items-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <Icon name="spark" className="h-4 w-4" />
                See how it works
              </button>
            </div>
            <div className="mt-8 flex items-center gap-2 text-[12px]" style={{ color: "#8894B4" }}>
              <Icon name="lock" className="h-4 w-4" />
              Private storage · SHA-256 integrity · no public document URLs
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/ui-screen.webp" alt="Resilient AI intake review interface" className="h-full w-full object-cover" />
            </div>
            <button
              onClick={() => document.getElementById("watch")?.scrollIntoView({ behavior: "smooth" })}
              aria-label="Play the intake walkthrough"
              className="group absolute inset-0 flex items-center justify-center rounded-2xl bg-[#050914]/35 transition hover:bg-[#050914]/20"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl transition group-hover:scale-105">
                <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6" fill={INK}>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- stats */}
      <section className="border-y border-white/10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-10 md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="border-l-2 border-white/15 pl-4">
              <div className="text-2xl font-semibold text-white">{stat.value}</div>
              <div className="mt-1 text-[12px] leading-5" style={{ color: "#96A2C2" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- evidence types */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-center text-[12px]" style={{ color: "#8C98B8" }}>
          Built around the evidence every AICTE institutional application already contains
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {EVIDENCE_PILLS.map((label) => (
            <span key={label} className="text-[13px] font-medium tracking-wide" style={{ color: "#C6D0EA" }}>
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- problem section */}
      <section id="problems" className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="max-w-2xl text-[34px] font-semibold leading-tight tracking-[-0.02em] text-white">
          Catch the intake failures that slow every approval
        </h2>
        <p className="mt-5 max-w-2xl text-[14px] leading-7" style={{ color: "#A5B0CD" }}>
          One missing certificate, one unreadable scan or one duplicated deck can send an application back
          a full cycle. Resilient AI reads the bundle the way a scrutiny officer does — page by page,
          document type by document type — and shows exactly what is missing before submission.
        </p>

        <div className="mt-9 overflow-hidden rounded-2xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/documents.webp" alt="Layered application documents analysed by Resilient AI" className="w-full object-cover" />
        </div>

        <div className="mt-10 grid gap-8 border-t border-white/10 pt-8 md:grid-cols-3">
          {INTAKE_PROBLEMS.map((item) => (
            <div key={item.title}>
              <div className="mb-4 h-0.5 w-full" style={{ background: BLUE }} />
              <h3 className="text-[14px] font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-6" style={{ color: "#96A2C2" }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- capabilities */}
      <section id="capabilities" className="bg-[#F5F6FA] py-20 text-[#0B1230]">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="max-w-2xl text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            The intake gateway every scrutiny workflow needs
          </h2>
          <p className="mt-5 max-w-2xl text-[14px] leading-7 text-[#54607C]">
            If you accept documents without checking what they are, you are deferring the problem to a
            reviewer. Resilient AI makes intake a first-class, auditable step instead of an inbox.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {CAPABILITIES.map((card) => (
              <div key={card.title} className="rounded-xl bg-white p-6 shadow-sm">
                <span className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "#E9EEFF", color: BLUE }}>
                  <Icon name={card.icon} />
                </span>
                <h3 className="text-[13px] font-semibold leading-5">{card.title}</h3>
                <p className="mt-3 text-[12.5px] leading-6 text-[#5A6580]">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- principle band */}
      <section className="border-y border-white/10" style={{ background: INK }}>
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-[1fr_1.4fr] md:items-center">
          <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "#7EA6FF" }}>
            Our design principle
          </div>
          <div>
            <p className="text-[22px] font-medium leading-9 text-white">
              “Every outcome points back to the page, the file hash and the rule version that produced it.
              A reviewer should never have to trust a black box — or an opaque success message.”
            </p>
            <p className="mt-5 text-[12px]" style={{ color: "#96A2C2" }}>
              Resilient AI platform principles · Modules 2–4 will add extraction, fraud detection and compliance checks
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- how it works */}
      <section id="how" className="bg-[#F5F6FA] py-20 text-[#0B1230]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium" style={{ color: BLUE }}>
                See the magic
              </p>
              <h2 className="mt-2 text-[34px] font-semibold tracking-[-0.02em]">How Module 1 works</h2>
            </div>
            <p className="max-w-sm text-[13px] leading-6 text-[#54607C]">
              Drag and drop a bundle in the browser. Every step below runs real backend logic and stores
              its result, so you can reload and see the same state.
            </p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <ol className="space-y-7">
              {STEPS.map((step, index) => (
                <li key={step.title} className="relative border-l-2 pl-5" style={{ borderColor: index === 0 ? BLUE : "#D8DFEC" }}>
                  <h3 className="text-[17px] font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-[#54607C]">{step.body}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#3B4A6B] shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: MINT }} />
                    {step.time}
                  </span>
                </li>
              ))}
            </ol>
            <div className="relative rounded-2xl bg-[#E9EDF5] p-6">
              <div className="overflow-hidden rounded-xl bg-white shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/ui-screen.webp" alt="Document intake review screen with warnings" className="w-full" />
              </div>
              <div className="absolute bottom-10 right-10 flex h-14 w-14 items-center justify-center rounded-full bg-[#F43F5E] text-2xl font-bold text-white shadow-xl">
                !
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- video */}
      <section id="watch" className="relative overflow-hidden py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: "url(/landing/waves.webp)", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="relative mx-auto max-w-5xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium" style={{ color: "#7EA6FF" }}>
                Product walkthrough
              </p>
              <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.02em] text-white">
                Watch the intake gateway run
              </h2>
            </div>
            <button
              onClick={() => setShowPlayer(true)}
              className="rounded-lg border border-white/25 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-white/10"
            >
              Play full screen
            </button>
          </div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-2xl">
            <video
              controls
              preload="metadata"
              poster="/landing/documents.webp"
              className="aspect-video h-full w-full"
              src="/landing/demo.mp4"
            >
              Your browser does not support embedded video. The walkthrough is available at
              /landing/demo.mp4.
            </video>
          </div>
          <p className="mt-4 text-[12px]" style={{ color: "#8C98B8" }}>
            Recorded on the local demo environment · synthetic documents only
          </p>
        </div>
      </section>

      {showPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true">
          <button
            onClick={() => setShowPlayer(false)}
            className="absolute right-5 top-5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            Close ✕
          </button>
          <video controls autoPlay className="max-h-[85vh] w-full max-w-5xl rounded-xl" src="/landing/demo.mp4" />
        </div>
      )}

      {/* ---------------------------------------------------------------- use cases */}
      <section id="use-cases" className="bg-white py-20 text-[#0B1230]">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-[12px] font-medium" style={{ color: BLUE }}>
            Use cases
          </p>
          <h2 className="mt-2 max-w-xl text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            Intake coverage for every part of an institutional submission
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((item) => (
              <article key={item.title} className="rounded-xl bg-[#F5F6FA] p-6">
                <div className="mb-6 flex h-24 items-end justify-start rounded-lg" style={{ background: "linear-gradient(135deg,#E7ECF7,#DCE4F3)" }}>
                  <span className="m-3 flex h-8 w-8 items-center justify-center rounded-md bg-white text-[#2F6BFF] shadow-sm">
                    <Icon name="list" className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-2 text-[12.5px] leading-6 text-[#5A6580]">{item.body}</p>
                <Link href="/login" className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium" style={{ color: BLUE }}>
                  Start an intake <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- CTA */}
      <section className="bg-white pb-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl px-8 py-8" style={{ background: INK }}>
            <div className="flex items-start gap-5">
              <svg viewBox="0 0 24 24" className="mt-1 h-7 w-7" fill="none" stroke={MINT} strokeWidth="2.2">
                <path d="M5 19L19 5M5 5l14 14" strokeLinecap="round" />
              </svg>
              <div>
                <h3 className="text-[20px] font-semibold text-white">Start validating intake today</h3>
                <p className="mt-2 text-[13px] leading-6" style={{ color: "#9AA6C7" }}>
                  Synthetic demo data is seeded. Sign in, create an application and upload a bundle.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="rounded-lg px-5 py-3 text-sm font-semibold transition hover:brightness-95"
              style={{ background: MINT, color: "#06231A" }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- insights */}
      <section id="insights" className="bg-white pb-20 text-[#0B1230]">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-[12px] font-medium" style={{ color: BLUE }}>
            Platform notes
          </p>
          <h2 className="mt-2 max-w-xl text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            What good intake looks like
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                image: "/landing/payoneer.webp",
                kicker: "Intake",
                title: "Hash first, ask questions later",
                body: "Keep the original bytes, hash them, and derive everything else. Integrity is cheap when it is designed in.",
              },
              {
                image: "/landing/waves.webp",
                kicker: "Review",
                title: "The review queue is a feature",
                body: "A confident classifier that hides its uncertainty is worse than an honest threshold and a human decision.",
              },
              {
                image: "/landing/documents.webp",
                kicker: "Evidence",
                title: "A manifest, not a success toast",
                body: "The output of intake is a durable record: page counts, hashes, classifications, warnings and corrections.",
              },
            ].map((card) => (
              <article key={card.title} className="overflow-hidden rounded-xl border border-[#E6EAF2]">
                <div className="relative h-44">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image} alt="" className="h-full w-full object-cover" />
                  <span className="absolute left-4 top-4 rounded bg-white/90 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[#0B1230]">
                    {card.kicker}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-[15px] font-semibold leading-6">{card.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-6 text-[#5A6580]">{card.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- access */}
      <section id="get-started" className="relative overflow-hidden py-20" style={{ background: INK }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ backgroundImage: "url(/landing/neural.webp)", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.02em] text-white">
              Validate any application bundle for intake
            </h2>
            <ul className="mt-7 space-y-3 text-[13px]" style={{ color: "#C1CBE5" }}>
              {[
                "PDF, image and ZIP bundle support with signature validation",
                "Page-level extraction with OCR fallback and quality flags",
                "Explainable classification with human correction",
                "Versioned checklist reconciliation and intake manifest",
                "Downloadable JSON and PDF intake reports",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: MINT }}>
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="#06231A" strokeWidth="2">
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-lg px-5 py-3 text-sm font-semibold transition hover:brightness-95"
                style={{ background: MINT, color: "#06231A" }}
              >
                Get Started
              </Link>
              <a
                href="#how"
                className="rounded-lg border border-white/25 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Review the pipeline
              </a>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-7 text-[#0B1230] shadow-2xl">
            <h3 className="text-[19px] font-semibold">Sign in to the intake workspace</h3>
            <p className="mt-2 text-[12.5px] leading-6 text-[#5A6580]">
              The demo environment includes synthetic applications, documents and a provisional AICTE
              checklist. No real institutional or identity documents are used.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { role: "Administrator", email: "admin@resilient-ai.local" },
                { role: "Scrutiny reviewer", email: "reviewer@resilient-ai.local" },
                { role: "Institution representative", email: "institution@resilient-ai.local" },
              ].map((account) => (
                <div key={account.email} className="flex items-center justify-between rounded-lg border border-[#E6EAF2] px-4 py-3">
                  <div>
                    <div className="text-[12px] font-semibold">{account.role}</div>
                    <div className="text-[11px] text-[#7B879F]">{account.email}</div>
                  </div>
                  <span className="rounded bg-[#F1F4FA] px-2 py-1 text-[10px] text-[#5A6580]">Password123!</span>
                </div>
              ))}
            </div>
            <Link
              href="/login"
              className="mt-6 block rounded-lg py-3 text-center text-sm font-semibold transition hover:brightness-95"
              style={{ background: INK, color: "#fff" }}
            >
              Continue to sign in
            </Link>
            <p className="mt-3 text-center text-[11px] text-[#7B879F]">
              Module 1 is implemented end to end. Later modules are marked as upcoming inside the workspace.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- FAQ */}
      <section id="faq" className="bg-[#F5F6FA] py-20 text-[#0B1230]">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-center text-[12px] font-medium" style={{ color: BLUE }}>
            Frequently asked questions
          </p>
          <h2 className="mt-2 text-center text-[32px] font-semibold tracking-[-0.02em]">
            Document intake, answered
          </h2>
          <p className="mt-3 text-center text-[13px] text-[#5A6580]">
            Everything you need to know about Module 1 before you upload a bundle.
          </p>
          <div className="mt-9 space-y-3">
            {FAQS.map((faq, index) => (
              <details key={faq.q} className="group rounded-xl bg-white shadow-sm" open={index === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[13px] font-semibold">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#D8DFEC] text-[#2F6BFF]">
                    <svg viewBox="0 0 12 12" className="h-3 w-3 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M6 2v8M2 6h8" strokeLinecap="round" />
                    </svg>
                    <svg viewBox="0 0 12 12" className="hidden h-3 w-3 group-open:block" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M2 6h8" strokeLinecap="round" />
                    </svg>
                  </span>
                  {faq.q}
                </summary>
                <p className="px-14 pb-5 text-[12.5px] leading-6 text-[#5A6580]">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- footer */}
      <footer className="py-16" style={{ background: "#050917" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <BrandMark dark />
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "#8894B4" }}>
              <span className="rounded border border-white/15 px-2 py-1">Private by design</span>
              <span className="rounded border border-white/15 px-2 py-1">Evidence-first</span>
              <span className="rounded border border-white/15 px-2 py-1">Human in the loop</span>
            </div>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Module 1",
                links: [
                  { label: "Intake gateway", href: "#how" },
                  { label: "Checklist reconciliation", href: "#capabilities" },
                  { label: "Intake manifest", href: "#insights" },
                  { label: "Reports & export", href: "#capabilities" },
                ],
              },
              {
                title: "Use cases",
                links: [
                  { label: "New applications", href: "#use-cases" },
                  { label: "Extension of Approval", href: "#use-cases" },
                  { label: "Faculty evidence", href: "#use-cases" },
                  { label: "Land & infrastructure", href: "#use-cases" },
                ],
              },
              {
                title: "Resources",
                links: [
                  { label: "How it works", href: "#how" },
                  { label: "Product walkthrough", href: "#watch" },
                  { label: "FAQ", href: "#faq" },
                  { label: "Platform notes", href: "#insights" },
                ],
              },
              {
                title: "Access",
                links: [
                  { label: "Sign in", href: "/login" },
                  { label: "Get started", href: "#get-started" },
                ],
              },
            ].map((column) => (
              <div key={column.title}>
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#7EA6FF" }}>
                  {column.title}
                </div>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("/") ? (
                        <Link href={link.href} className="text-[12px] text-[#B6C1DC] transition hover:text-white">
                          {link.label}
                        </Link>
                      ) : (
                        <a href={link.href} className="text-[12px] text-[#B6C1DC] transition hover:text-white">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-[11px]" style={{ color: "#7C88A6" }}>
            <span>© {new Date().getFullYear()} Resilient AI X ShadeX · ShadeX Compliance</span>
            <span>
              Module 1 determines intake readiness only. Classification is not proof of authenticity or
              regulatory compliance.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
