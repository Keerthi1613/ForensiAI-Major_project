import React from "react";

export default function MessageBubble({ role, content }) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-4 py-3 shadow-soft border",
          "whitespace-pre-wrap text-sm leading-relaxed",
          isUser
            ? "bg-primary/15 border-primary/30 text-slate-100"
            : "bg-white/5 border-white/10 text-slate-200"
        ].join(" ")}
      >
        {content}
      </div>
    </div>
  );
}

