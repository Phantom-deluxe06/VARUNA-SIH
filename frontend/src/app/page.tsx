"use client";

import Link from "next/link";
import {
  Anchor,
  ArrowRight,
  Bot,
  CheckCircle2,
  Compass,
  Cpu,
  Database,
  ExternalLink,
  Fish,
  Layers,
  MapPin,
  MessageSquare,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ship,
  Sparkles,
  Terminal,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import { WhatsAppQR } from "@/components/WhatsAppQR";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-varuna-bg text-slate-100 selection:bg-varuna-accent selection:text-varuna-bg">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP STICKY NAVBAR                                          */}
      {/* ------------------------------------------------------------- */}
      <nav className="sticky top-0 z-50 border-b border-varuna-border/80 bg-varuna-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-varuna-accent to-blue-600 shadow-md shadow-varuna-accent/20 group-hover:scale-105 transition-transform">
              <Waves className="h-5 w-5 text-varuna-bg" />
            </div>
            <div>
              <span className="text-xl font-black tracking-wider text-varuna-accent">
                VARUNA
              </span>
              <span className="ml-1.5 hidden rounded bg-varuna-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-varuna-accent sm:inline-block border border-varuna-accent/30">
                MOS 3.0
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <a href="#features" className="hover:text-varuna-accent transition">
              Capabilities
            </a>
            <a href="#personas" className="hover:text-varuna-accent transition">
              Stakeholder Roles
            </a>
            <a href="#architecture" className="hover:text-varuna-accent transition">
              Architecture
            </a>
            <a href="#whatsapp" className="hover:text-varuna-accent transition">
              WhatsApp Bot
            </a>
            <a href="#impact" className="hover:text-varuna-accent transition">
              Impact
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-varuna-accent to-cyan-400 px-4 py-2 text-xs font-bold text-varuna-bg shadow-lg shadow-varuna-accent/25 transition-all hover:brightness-110 hover:shadow-varuna-accent/40 active:scale-95"
            >
              <span>Launch Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------- */}
      {/* 2. HERO SECTION                                               */}
      {/* ------------------------------------------------------------- */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
        {/* Background glow & ocean mesh */}
        <div className="absolute top-1/4 left-1/2 -z-10 h-[450px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-varuna-accent/10 blur-[130px]" />
        <div className="absolute top-1/2 left-1/4 -z-10 h-[300px] w-[400px] rounded-full bg-blue-600/10 blur-[100px]" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-varuna-accent/40 bg-varuna-panel/90 px-3.5 py-1 text-xs font-semibold text-varuna-accent shadow-inner backdrop-blur mb-6">
            <span className="flex h-2 w-2 rounded-full bg-varuna-safe animate-pulse" />
            <span>Smart India Hackathon · Marine Operational System (MOS)</span>
          </div>

          {/* Main Title */}
          <h1 className="mx-auto max-w-5xl text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-slate-100">
            Autonomous Maritime Intelligence for{" "}
            <span className="bg-gradient-to-r from-varuna-accent via-cyan-300 to-varuna-safe bg-clip-text text-transparent">
              Indian Coastal Waters
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-3xl text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed">
            An <strong className="text-varuna-accent font-semibold">offline-first multi-agent co-pilot</strong> that fuses real-time oceanographic telemetry, satellite Earth observation, and deterministic bilingual AI (Tamil/English) to safeguard fishermen, optimize port pilotage, and enforce maritime geofencing.
          </p>

          {/* Hero CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-varuna-accent via-cyan-400 to-teal-400 px-6 py-3.5 text-sm font-black text-varuna-bg shadow-xl shadow-varuna-accent/30 transition hover:brightness-110 active:scale-95"
            >
              <Zap className="h-4 w-4" />
              <span>Launch Live MOS Console</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <a
              href="#whatsapp"
              className="flex items-center gap-2 rounded-xl border border-varuna-border bg-varuna-panel/80 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-varuna-accent hover:text-varuna-accent hover:bg-varuna-panel active:scale-95"
            >
              <MessageSquare className="h-4 w-4 text-emerald-400" />
              <span>WhatsApp Pilot Demo</span>
            </a>
          </div>

          {/* Quick Role Launchers */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-500 mr-1">Direct Persona Jump:</span>
            <Link
              href="/dashboard?role=fisherman"
              className="rounded-full border border-varuna-border bg-varuna-bg/90 px-3 py-1 text-slate-300 hover:border-varuna-accent hover:text-varuna-accent transition"
            >
              🐟 Fisherman Mode
            </Link>
            <Link
              href="/dashboard?role=port_pilot"
              className="rounded-full border border-varuna-border bg-varuna-bg/90 px-3 py-1 text-slate-300 hover:border-varuna-accent hover:text-varuna-accent transition"
            >
              ⚓ Port Pilot (UKC)
            </Link>
            <Link
              href="/dashboard?role=disaster_officer"
              className="rounded-full border border-varuna-border bg-varuna-bg/90 px-3 py-1 text-slate-300 hover:border-varuna-accent hover:text-varuna-accent transition"
            >
              🛡️ Coast Guard IMBL
            </Link>
          </div>

          {/* Live Telemetry Ticker Preview */}
          <div className="mt-12 rounded-2xl border border-varuna-border bg-varuna-panel/70 p-4 shadow-2xl backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between border-b border-varuna-border/60 pb-3 text-xs">
              <div className="flex items-center gap-2 font-mono text-varuna-accent">
                <Radio className="h-3.5 w-3.5 animate-pulse text-varuna-safe" />
                <span>LIVE TELEMETRY STREAM · PALK STRAIT / RAMESWARAM</span>
              </div>
              <span className="font-mono text-slate-400 text-[11px]">Lat: 9.9252°N · Lon: 79.3129°E</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
              <div className="rounded-xl border border-varuna-border/60 bg-varuna-bg/60 p-3 text-left">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Waves className="h-3.5 w-3.5 text-varuna-accent" />
                  <span>Swell / Wave</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-slate-100">1.8 m</p>
                <span className="text-[10px] text-varuna-safe font-medium">Safe to Navigate</span>
              </div>

              <div className="rounded-xl border border-varuna-border/60 bg-varuna-bg/60 p-3 text-left">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Wind className="h-3.5 w-3.5 text-varuna-accent" />
                  <span>Wind & Gusts</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-slate-100">12 kn</p>
                <span className="text-[10px] text-slate-400 font-medium">Moderate Breeze</span>
              </div>

              <div className="rounded-xl border border-varuna-border/60 bg-varuna-bg/60 p-3 text-left">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldAlert className="h-3.5 w-3.5 text-varuna-warn" />
                  <span>IMBL Distance</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-slate-100">8.4 NM</p>
                <span className="text-[10px] text-varuna-safe font-medium">Clear of Buffer</span>
              </div>

              <div className="rounded-xl border border-varuna-border/60 bg-varuna-bg/60 p-3 text-left">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Fish className="h-3.5 w-3.5 text-varuna-accent" />
                  <span>Nearest PFZ</span>
                </div>
                <p className="mt-1 font-mono text-lg font-bold text-slate-100">12.3 NM</p>
                <span className="text-[10px] text-varuna-accent font-medium">91% Confidence</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 3. THREE CORE STAKEHOLDER PERSONAS                            */}
      {/* ------------------------------------------------------------- */}
      <section id="personas" className="py-16 border-t border-varuna-border/70 bg-varuna-panel/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-varuna-accent">
              Multi-Agent Domain Intelligence
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black text-slate-100">
              One Engine. Three Mission-Critical Personas.
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              VARUNA morphs its advisory algorithms and user interface depending on the operational context of the user.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Card 1: Fisherman */}
            <div className="group flex flex-col justify-between rounded-2xl border border-varuna-border bg-varuna-panel/80 p-6 shadow-xl transition hover:border-varuna-accent/60 hover:shadow-varuna-accent/10">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-varuna-accent border border-blue-500/20 mb-5 group-hover:scale-110 transition-transform">
                  <Fish className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-varuna-accent">
                  Role 01 · Artisanal & Commercial
                </span>
                <h3 className="mt-1 text-xl font-bold text-slate-100">
                  Fishermen / மீனவர்
                </h3>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Real-time sea state safety assessments, Potential Fishing Zone (PFZ) vectors, and automatic international boundary breach avoidance.
                </p>

                <ul className="mt-4 space-y-2 text-xs text-slate-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>Live Wave Height & Wind advisories</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>30%+ Diesel fuel savings via PFZ coordinates</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>Bilingual voice & text Tamil guidance</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/dashboard?role=fisherman"
                className="mt-6 flex items-center justify-center gap-1.5 rounded-xl border border-varuna-border bg-varuna-bg/80 py-2.5 text-xs font-bold text-varuna-accent hover:bg-varuna-accent hover:text-varuna-bg transition"
              >
                <span>Launch Fisherman Mode</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Card 2: Port Pilot */}
            <div className="group flex flex-col justify-between rounded-2xl border border-varuna-border bg-varuna-panel/80 p-6 shadow-xl transition hover:border-varuna-accent/60 hover:shadow-varuna-accent/10">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-5 group-hover:scale-110 transition-transform">
                  <Ship className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                  Role 02 · Harbor Navigation
                </span>
                <h3 className="mt-1 text-xl font-bold text-slate-100">
                  Port Pilot & Hydrography
                </h3>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Dynamic Under-Keel Clearance (UKC) calculation based on vessel draft, port bathymetry, and live tidal surge offsets.
                </p>

                <ul className="mt-4 space-y-2 text-xs text-slate-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>UKC Formula: (Depth + Surge) - Draft</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>Chennai, Thoothukudi & Ennore channel presets</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>Zero-grounding clearance confirmation</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/dashboard?role=port_pilot"
                className="mt-6 flex items-center justify-center gap-1.5 rounded-xl border border-varuna-border bg-varuna-bg/80 py-2.5 text-xs font-bold text-cyan-400 hover:bg-cyan-400 hover:text-varuna-bg transition"
              >
                <span>Launch Port Pilot Mode</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Card 3: Coast Guard */}
            <div className="group flex flex-col justify-between rounded-2xl border border-varuna-border bg-varuna-panel/80 p-6 shadow-xl transition hover:border-varuna-accent/60 hover:shadow-varuna-accent/10">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-varuna-warn border border-red-500/20 mb-5 group-hover:scale-110 transition-transform">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-varuna-warn">
                  Role 03 · Maritime Security
                </span>
                <h3 className="mt-1 text-xl font-bold text-slate-100">
                  Coast Guard & Surveillance
                </h3>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Continuous Palk Bay International Maritime Boundary Line (IMBL) geofencing with 2 NM and 5 NM multi-tier security buffer ribbons.
                </p>

                <ul className="mt-4 space-y-2 text-xs text-slate-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>Great-Circle Cross-Track distance calculations</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>High-risk breach alerts (SAFE / CAUTION / CRITICAL)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-varuna-safe shrink-0" />
                    <span>Incident reduction in Palk Bay sector</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/dashboard?role=disaster_officer"
                className="mt-6 flex items-center justify-center gap-1.5 rounded-xl border border-varuna-border bg-varuna-bg/80 py-2.5 text-xs font-bold text-varuna-warn hover:bg-varuna-warn hover:text-varuna-bg transition"
              >
                <span>Launch Coast Guard Mode</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 4. SYSTEM ARCHITECTURE & CAPABILITIES                        */}
      {/* ------------------------------------------------------------- */}
      <section id="architecture" className="py-16 border-t border-varuna-border/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-varuna-accent">
              Engineering Excellence
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black text-slate-100">
              Offline-First Hybrid Architecture
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              Designed to work reliably in remote ocean zones with zero internet, zero cloud vendor lock-in, and instant deterministic responses.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-varuna-border bg-varuna-panel/60 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-varuna-accent/10 text-varuna-accent mb-4">
                <Database className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-slate-100">Embedded SQLite Store</h4>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Zero external database servers. Ports, bathymetry, IMBL geofence coordinates, and query audit logs persist locally in WAL mode.
              </p>
            </div>

            <div className="rounded-2xl border border-varuna-border bg-varuna-panel/60 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-varuna-safe mb-4">
                <Cpu className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-slate-100">Satellite EO Raster Engine</h4>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Ingests NOAA ERDDAP & Copernicus SST and chlorophyll grids. Computes thermal fronts and gradient anomalies offline.
              </p>
            </div>

            <div className="rounded-2xl border border-varuna-border bg-varuna-panel/60 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 mb-4">
                <Bot className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-slate-100">LangGraph Multi-Agent</h4>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Intent routing orchestration that combines domain rules, geometric math, and machine learning into verifiable decisions.
              </p>
            </div>

            <div className="rounded-2xl border border-varuna-border bg-varuna-panel/60 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 mb-4">
                <Terminal className="h-5 w-5" />
              </div>
              <h4 className="text-base font-bold text-slate-100">Deterministic Tamil Engine</h4>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                Zero LLM hallucinations for safety-critical metrics. Uses curated Tamil advisory templates populated directly with live sensor values.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 5. WHATSAPP BOT INTEGRATION SHOWCASE                         */}
      {/* ------------------------------------------------------------- */}
      <section id="whatsapp" className="py-16 border-t border-varuna-border/70 bg-gradient-to-b from-varuna-bg to-varuna-panel/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 mb-4">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Zero-App Low-Bandwidth Interface</span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-100">
                Marine Safety Direct on WhatsApp
              </h2>
              <p className="mt-4 text-sm text-slate-300 leading-relaxed">
                Fishermen don&apos;t need to install complex mobile applications. They can simply share their live WhatsApp location pin or send questions in Tamil/English to receive instant voice and text advisories.
              </p>

              <div className="mt-6 space-y-3 text-xs text-slate-300">
                <div className="flex items-start gap-3 rounded-xl border border-varuna-border/80 bg-varuna-panel/60 p-3">
                  <MapPin className="h-4 w-4 text-varuna-accent shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-100">Location-Pin Aware:</strong> Share a live WhatsApp pin; VARUNA immediately runs spatial cross-track to the border and calculates local wave height.
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-varuna-border/80 bg-varuna-panel/60 p-3">
                  <Sparkles className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-100">Native Tamil Queries:</strong> Ask &quot;மீன் எங்க?&quot; or &quot;Safe-ஆ?&quot; for immediate deterministic safety clearances.
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4">
                <div className="bg-varuna-bg/80 p-2 rounded-xl border border-emerald-500/30">
                  <WhatsAppQR
                    phoneNumber="+14155238886"
                    joinCode="join varuna"
                    size={110}
                  />
                </div>
                <div className="space-y-1 text-center sm:text-left">
                  <p className="text-xs font-bold text-emerald-300">📱 Scan QR Code or Connect on WhatsApp:</p>
                  <p className="font-mono text-xs text-slate-200">Phone: +1 415 523 8886</p>
                  <p className="font-mono text-xs text-cyan-300">Sandbox Code: join varuna</p>
                  <p className="text-[11px] text-slate-400">Webhook active on /whatsapp/webhook</p>
                </div>
              </div>
            </div>

            {/* Simulated Chat Interface */}
            <div className="rounded-2xl border border-varuna-border bg-slate-900/90 p-5 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="h-9 w-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-sm">
                  V
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-100">VARUNA Marine Co-Pilot</p>
                  <p className="text-[10px] text-emerald-400">🟢 Online · SIH Official Bot</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="self-end bg-emerald-800/60 rounded-xl p-3 ml-auto max-w-[80%] text-slate-100 border border-emerald-700/40">
                  📍 <em>Shared live location pin (9.9252°N, 79.3129°E - Rameswaram)</em>
                </div>

                <div className="bg-slate-800/80 rounded-xl p-3.5 mr-auto max-w-[85%] text-slate-200 border border-slate-700">
                  <p className="font-bold text-varuna-safe">🟢 கடல் பயணம் பாதுகாப்பானது (Safe to Sail)</p>
                  <p className="mt-1">🌊 அலை உயரம்: <strong>1.8m</strong> | காற்று: <strong>12 kn</strong></p>
                  <p>🚨 IMBL எல்லை தூரம்: <strong>8.4 NM</strong> (பாதுகாப்பானது)</p>
                  <p>🐟 சிறந்த மீன்பிடி மண்டலம்: <strong>12.3 NM @ 115°</strong> தென்கிழக்கு</p>
                  <p className="mt-2 text-[10px] text-slate-400">📡 தரவு: OPEN_METEO_MARINE_LIVE</p>
                </div>

                <div className="self-end bg-emerald-800/60 rounded-xl p-3 ml-auto max-w-[80%] text-slate-100 border border-emerald-700/40">
                  மீன் எங்க இருக்கு?
                </div>

                <div className="bg-slate-800/80 rounded-xl p-3.5 mr-auto max-w-[85%] text-slate-200 border border-slate-700">
                  <p className="font-bold text-varuna-accent">🐟 Potential Fishing Zone (PFZ):</p>
                  <p className="mt-1">அருகிலுள்ள PFZ மண்டலம் <strong>12.3 NM</strong> தூரத்தில் <strong>115° திசையில்</strong> உள்ளது. SST: 28.5°C.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 6. CALL TO ACTION BANNER                                      */}
      {/* ------------------------------------------------------------- */}
      <section className="py-16 border-t border-varuna-border/70">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-varuna-accent/40 bg-gradient-to-r from-varuna-panel via-slate-900 to-cyan-950 p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -z-10 h-64 w-64 rounded-full bg-varuna-accent/15 blur-[80px]" />
            <div className="absolute bottom-0 left-0 -z-10 h-64 w-64 rounded-full bg-blue-600/15 blur-[80px]" />

            <h2 className="text-2xl sm:text-4xl font-black text-slate-100">
              Experience the Live Marine Operational Console
            </h2>
            <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
              Explore interactive map tracking, live Open-Meteo telemetry ingestion, under-keel clearance calculation, and real-time safety advisories.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-varuna-accent to-cyan-400 px-8 py-4 text-sm font-black text-varuna-bg shadow-xl shadow-varuna-accent/30 transition hover:brightness-110 active:scale-95"
              >
                <Zap className="h-5 w-5" />
                <span>Launch VARUNA Dashboard Now</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 7. FOOTER                                                     */}
      {/* ------------------------------------------------------------- */}
      <footer className="border-t border-varuna-border/60 bg-varuna-panel/70 py-8 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-300 font-bold">
            <Waves className="h-4 w-4 text-varuna-accent" />
            <span>VARUNA (Jal-Raksha) · SIH Edition</span>
          </div>
          <p className="text-center sm:text-left">
            Offline-First Marine Intelligence Platform · Indian Waters (Palk Bay & Gulf of Mannar)
          </p>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-varuna-accent hover:underline">
              Dashboard Console
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
