import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiSend } from "react-icons/fi";
import MessageBubble from "./MessageBubble.jsx";

export default function ChatWindow({ onSend, loading }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => [
    {
      id: "m_welcome",
      role: "ai",
      content:
        "Welcome to ForensiAI. Ask me to summarize an incident, explain suspicious events, or suggest next investigation steps."
    }
  ]);
  const listRef = useRef(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");

    const userMsg = { id: `m_user_${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const reply = await onSend(text);
      const aiMsg = { id: `m_ai_${Date.now()}`, role: "ai", content: reply };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      const aiMsg = {
        id: `m_ai_err_${Date.now()}`,
        role: "ai",
        content: "I couldn’t reach the analysis service. Please try again in a moment."
      };
      setMessages((prev) => [...prev, aiMsg]);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    handleSend();
  }

  return (
    <div className="bg-card border border-white/10 rounded-2xl shadow-soft overflow-hidden flex flex-col h-[70vh]">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-100">ForensiAI Assistant</div>
          <div className="text-xs text-slate-500">Incident triage and investigation support</div>
        </div>
        {loading ? (
          <div className="text-xs text-slate-400">Analyzing…</div>
        ) : (
          <div className="text-xs text-slate-500">Ready</div>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {loading ? <MessageBubble role="ai" content="Thinking…" /> : null}
      </div>

      <form onSubmit={onSubmit} className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-background/40 px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about an incident, IP, or suspicious event..."
            className="w-full bg-transparent outline-none text-sm placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={!canSend}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
              canSend
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-white/10 text-slate-400 cursor-not-allowed"
            ].join(" ")}
          >
            <FiSend />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}

