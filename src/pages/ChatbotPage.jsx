import React, { useState, useRef, useEffect } from "react";
import { FiSend, FiCpu, FiUser, FiZap } from "react-icons/fi";
import { chatWithAI } from "../services/api.js";

export default function ChatbotPage() {
  const [messages, setMessages] = useState([
    { id: 1, role: "assistant", content: "System Online. I am the ForensiAI Neural Analyst. How can I assist with your investigation today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = { id: Date.now(), role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await chatWithAI(input);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", content: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", content: "Error: Neural link interrupted. Please check SOC connectivity." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">AI Analyst</h1>
          <p className="text-sm text-slate-500 mt-1">Neural-assisted threat correlation and natural language query.</p>
        </div>
        <div className="flex items-center gap-2 text-[0.7rem] font-bold text-primary uppercase tracking-widest bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">
          <FiZap className="animate-pulse" /> Model Active
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 soc-card mb-6 overflow-hidden flex flex-col p-0">
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-4 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`h-10 w-10 rounded-xl shrink-0 flex items-center justify-center border ${
                  msg.role === 'assistant' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-white/5 border-white/10 text-slate-400'
                }`}>
                  {msg.role === 'assistant' ? <FiCpu size={20} /> : <FiUser size={20} />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'assistant' ? 'bg-white/5 text-slate-200 rounded-tl-none' : 'bg-primary text-white rounded-tr-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-4 max-w-[80%]">
                <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                  <FiCpu size={20} className="animate-spin" />
                </div>
                <div className="p-4 bg-white/5 text-slate-500 rounded-2xl rounded-tl-none italic text-xs tracking-widest uppercase font-bold">
                  Analyzing Signals...
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-6 bg-white/[0.02] border-t border-white/5">
          <div className="relative group">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query the AI Analyst (e.g. 'Summarize recent high-risk IP flows')..."
              className="w-full input-soc pl-6 pr-16 h-14 bg-white/[0.03]"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-30"
            >
              <FiSend size={20} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
