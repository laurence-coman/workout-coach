"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "tool"; content: string };
type Session = { id: string; title: string | null; created_at: string };

function sessionLabel(s: Session) {
  return s.title || "New conversation";
}

function sessionDate(s: Session) {
  return new Date(s.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function Chat() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openSession(id: string) {
    setSessionId(id);
    setHistoryOpen(false);
    const m = await fetch(`/api/messages?session_id=${id}`).then((r) => r.json());
    setMessages(Array.isArray(m) ? m : []);
  }

  async function newChat() {
    const s = await fetch("/api/sessions", { method: "POST" }).then((r) => r.json());
    if (s?.id) {
      setSessions((prev) => [s, ...prev]);
      setSessionId(s.id);
      setMessages([]);
      setHistoryOpen(false);
    }
  }

  useEffect(() => {
    (async () => {
      const s = await fetch("/api/sessions").then((r) => r.json());
      const list: Session[] = Array.isArray(s) ? s : [];
      setSessions(list);
      if (list.length > 0) {
        await openSession(list[0].id);
      } else {
        await newChat();
      }
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || loading || !sessionId) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      const additions: Msg[] = [];
      for (const event of data.toolEvents ?? []) {
        additions.push({ role: "tool", content: `✓ ${event}` });
      }
      additions.push({ role: "assistant", content: data.reply });
      setMessages((m) => [...m, ...additions]);
      // refresh titles (first message names the session)
      fetch("/api/sessions")
        .then((r) => r.json())
        .then((s) => Array.isArray(s) && setSessions(s));
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

  const sidebar = (
    <aside className={`sessions-panel ${historyOpen ? "open" : ""}`}>
      <button className="btn new-chat" onClick={newChat}>
        + New chat
      </button>
      <div className="sessions-list">
        {sessions.map((s) => (
          <button
            key={s.id}
            className={`session-item ${s.id === sessionId ? "active" : ""}`}
            onClick={() => openSession(s.id)}
          >
            <span className="session-title">{sessionLabel(s)}</span>
            <span className="session-date">{sessionDate(s)}</span>
          </button>
        ))}
      </div>
    </aside>
  );

  return (
    <div className="chat-layout">
      {sidebar}
      {historyOpen && (
        <div className="scrim" onClick={() => setHistoryOpen(false)} />
      )}
      <div className="chat-container">
        <div className="chat-topbar">
          <button
            className="btn btn-secondary history-toggle"
            onClick={() => setHistoryOpen(true)}
          >
            History
          </button>
          <button className="btn btn-secondary history-toggle" onClick={newChat}>
            + New
          </button>
        </div>
        <div className="chat-messages">
          {booting && <div className="msg msg-assistant">Loading your conversations…</div>}
          {!booting && messages.length === 0 && (
            <div className="empty-state">
              <p className="empty-title">What did you do today?</p>
              <p className="empty-sub">
                Log a workout, ask for a plan, or check in on your training.
              </p>
              <div className="chips">
                {[
                  "Plan my next workout",
                  "Log today's session",
                  "How's my training load this week?",
                ].map((c) => (
                  <button key={c} className="chip" onClick={() => setInput(c)}>
                    {c}
                  </button>
                ))}
              </div>
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
                    {copied === i ? "Copied ✓" : "Copy"}
                  </button>
                )}
              </div>
            )
          )}
          {loading && (
            <div className="msg msg-assistant typing">
              <span />
              <span />
              <span />
            </div>
          )}
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
          <button className="btn send-btn" onClick={send} disabled={loading}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
