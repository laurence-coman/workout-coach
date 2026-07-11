"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "tool"; content: string };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      const additions: Msg[] = [];
      for (const event of data.toolEvents ?? []) {
        additions.push({ role: "tool", content: `✓ ${event}` });
      }
      additions.push({ role: "assistant", content: data.reply });
      setMessages((m) => [...m, ...additions]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="msg msg-assistant">
            Hey! I&apos;m your workout coach. Tell me what you did today, ask
            for a plan, or set your goals in Settings. Everything you log here
            shows up on the Dashboard.
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "tool" ? (
            <div key={i} className="msg-tool">
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className={`msg ${m.role === "user" ? "msg-user" : "msg-assistant"}`}
            >
              {m.content}
              {m.role === "assistant" && (
                <button
                  className="copy-btn"
                  title="Copy to clipboard"
                  onClick={() => {
                    navigator.clipboard.writeText(m.content);
                    setCopied(i);
                    setTimeout(() => setCopied(null), 1500);
                  }}
                >
                  {copied === i ? "Copied \u2713" : "Copy"}
                </button>
              )}
            </div>
          )
        )}
        {loading && <div className="msg msg-assistant">Thinking…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <textarea
          rows={2}
          value={input}
          placeholder="e.g. Ran 5k this morning, felt easy. What should I do tomorrow?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn" onClick={send} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}
