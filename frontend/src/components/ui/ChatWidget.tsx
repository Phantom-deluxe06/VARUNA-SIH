"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { postQuery } from "@/lib/api";

interface Msg {
  id: number;
  from: "user" | "varuna";
  text: string;
  level?: string;
}

let nextId = 1;
const QUICK = ["🐟 மீன் எங்க?", "⚠️ Safe-ஆ?", "🚨 எல்லை?", "🌊 அலை உயரம்?", "⛽ Diesel?"];

export default function ChatWidget({
  vesselLat,
  vesselLon,
  className = "",
  height = "480px",
}: {
  vesselLat?: number;
  vesselLon?: number;
  className?: string;
  height?: string;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Msg[]>([
    { id: nextId++, from: "user", text: "மீன் எங்க இருக்கு?" },
    {
      id: nextId++,
      from: "varuna",
      text: "🐟 மீன் மண்டலம் 38.7NM தெற்கில். அலை 0.52m — பயணம் பாதுகாப்பானது.",
      level: "SAFE",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId++, from: "user", text }]);
    setSending(true);
    try {
      const res = await postQuery(text, "fisherman", vesselLat, vesselLon);
      const reply = res.advisory_ta ?? res.advisory_en ?? "…";
      setMessages((m) => {
        const replyMsg: Msg = { id: nextId++, from: "varuna", text: reply, level: res.alert_level };
        const next = [...m, replyMsg];
        return next.slice(-10); // keep last 10 messages
      });
    } catch {
      setMessages((m) => [
        ...m,
        { id: nextId++, from: "varuna", text: "⚠️ Could not reach VARUNA servers. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`v-card flex flex-col overflow-hidden ${className}`} style={{ height }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: m.from === "user" ? 40 : -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-small leading-relaxed ${
                  m.from === "user" ? "rounded-br-sm" : "rounded-bl-sm"
                }`}
                style={
                  m.from === "user"
                    ? { background: "var(--cyan-gradient)", color: "#03045E", fontWeight: 600 }
                    : { background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }
                }
              >
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {sending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1.5 px-2">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full"
                style={{ background: "#00B4D8" }}
                animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        )}
      </div>
      {/* Quick action pills */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={sending}
            className="rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-300 hover:shadow-card disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {q}
          </button>
        ))}
      </div>
      {/* Input row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 border-t p-3"
        style={{ borderColor: "var(--border)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("ask_varuna")}
          aria-label={t("ask_varuna")}
          className="v-input flex-1 px-3 py-2.5 text-small"
        />
        <button
          type="button"
          aria-label="Voice input"
          onClick={startVoice}
          className="flex h-10 w-10 items-center justify-center rounded-btn border transition-all duration-300"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <Mic size={18} />
        </button>
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label={t("send")}
          className="v-btn-primary flex h-10 w-10 items-center justify-center disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>
      <div className="px-3 pb-2 text-center text-xs" style={{ color: "var(--muted)" }}>
        Powered by LangGraph AI
      </div>
    </div>
  );
}

/** Tamil-first speech recognition (graceful no-op where unsupported). */
function startVoice() {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => {
        lang: string;
        onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
        onerror: () => void;
        start: () => void;
      })
    | undefined;
  if (!SR) return;
  const rec = new SR();
  rec.lang = "ta-IN";
  rec.onresult = (e) => {
    const el = document.querySelector<HTMLInputElement>("input[aria-label*='VARUNA']");
    if (el) {
      el.value = e.results[0][0].transcript;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  rec.onerror = () => undefined;
  rec.start();
}

