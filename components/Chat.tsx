"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { SOURCES, SOURCE_TAG_RE } from "@/components/sources";

type Msg = { role: "user" | "assistant" | "tool"; content: string };
type Session = { id: string; title: string | null; created_at: string };

function toPlainText(md: string) {
  return md
    .replace(SOURCE_TAG_RE, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,4}\s*/gm, "")
    .replace(/`/g, "");
}

function withSourceChips(md: string) {
  return md.replace(SOURCE_TAG_RE, (_, tag) => `[ⓘ](#src:${encodeURIComponent(tag)})`);
}

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
  const [sourceTag, setSourceTag] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Coming back to a backgrounded tab: the coach may have finished while we
  // were away - reload this conversation from the server.
  const loadingRef = useRef(false);
  const sessionRef = useRef<string | null>(null);
  loadingRef.current = loading;
  sessionRef.current = sessionId;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !loadingRef.current && sessionRef.current) {
        fetch(`/api/messages?session_id=${sessionRef.current}`)
          .then((r) => r.json())
          .then((m) => Array.isArray(m) && setMessages(m));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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

  async function renameSession(id: string) {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
  }

  async function deleteSession(id: string) {
    if (!window.confirm("Delete this conversation? Workout logs are unaffected.")) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    await fetch("/api/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (sessionId === id) {
      const rest = sessions.filter((s) => s.id !== id);
      if (rest.length > 0) openSession(rest[0].id);
      else newChat();
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
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }
      // Start an empty assistant bubble and stream into it
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const append = (delta: string) =>
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = { ...last, content: last.content + delta };
          }
          return copy;
        });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { t: string; v?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.t === "d" && evt.v) append(evt.v);
          else if (evt.t === "tool" && evt.v) {
            // tool tick, then a fresh bubble for the follow-up text
            setMessages((m) => {
              const copy = m.filter(
                (x, i) => !(i === m.length - 1 && x.role === "assistant" && !x.content)
              );
              return [
                ...copy,
                { role: "tool", content: `✓ ${evt.v}` },
                { role: "assistant", content: "" },
              ];
            });
          } else if (evt.t === "err" && evt.v) append(`\n\nSomething went wrong: ${evt.v}`);
        }
      }
      // Stream finished: if nothing arrived, say so instead of vanishing.
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last?.role === "assistant" && !last.content) {
          const anyContent = m.some((x) => x.role === "assistant" && x.content);
          const copy = m.slice(0, -1);
          if (!anyContent || m.filter((x) => x.role === "assistant").length === 1) {
            copy.push({
              role: "assistant",
              content: "No reply came through - that one's on me, not you. Send it again.",
            });
          }
          return copy;
        }
        return m;
      });
      // refresh titles (first message names the session)
      fetch("/api/sessions")
        .then((r) => r.json())
        .then((s) => Array.isArray(s) && setSessions(s));
    } catch {
      // Stream died (likely backgrounded tab) - the server keeps generating
      // and saves the reply. Poll the conversation until it lands.
      setMessages((m) => [
        ...m.filter((x, i) => !(i === m.length - 1 && x.role === "assistant" && !x.content)),
        { role: "tool", content: "✓ Connection dropped - recovering your coach's reply…" },
      ]);
      const sid = sessionId;
      const recover = (attempt: number) => {
        fetch(`/api/messages?session_id=${sid}`)
          .then((r) => r.json())
          .then((m) => {
            if (Array.isArray(m) && m.length && m[m.length - 1].role === "assistant") {
              setMessages(m);
            } else if (attempt < 6) {
              setTimeout(() => recover(attempt + 1), 4000);
            }
          })
          .catch(() => attempt < 6 && setTimeout(() => recover(attempt + 1), 4000));
      };
      setTimeout(() => recover(1), 3000);
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
          <div
            key={s.id}
            className={`session-item ${s.id === sessionId ? "active" : ""}`}
            onClick={() => editingId !== s.id && openSession(s.id)}
          >
            {editingId === s.id ? (
              <input
                className="session-edit"
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameSession(s.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => renameSession(s.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="session-title">{sessionLabel(s)}</span>
                <span className="session-actions">
                  <button
                    className="icon-btn"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(s.id);
                      setEditTitle(sessionLabel(s));
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                  >
                    ✕
                  </button>
                </span>
                <span className="session-date">{sessionDate(s)}</span>
              </>
            )}
          </div>
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
                {m.role === "assistant" ? (
                  <div className="md">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => {
                          if (href?.startsWith("#src:")) {
                            const tag = decodeURIComponent(href.slice(5));
                            return (
                              <button
                                className="src-chip"
                                title={SOURCES[tag]?.name ?? tag}
                                onClick={() => setSourceTag(tag)}
                              >
                                {SOURCES[tag]?.label ?? "ⓘ"}
                              </button>
                            );
                          }
                          return (
                            <a href={href} target="_blank" rel="noreferrer">
                              {children}
                            </a>
                          );
                        },
                      }}
                    >
                      {withSourceChips(m.content)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
                {m.role === "assistant" && (
                  <button
                    className="copy-btn"
                    title="Copy to clipboard"
                    onClick={() => {
                      navigator.clipboard.writeText(toPlainText(m.content));
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
        {sourceTag && SOURCES[sourceTag] && (
          <div className="modal-scrim" onClick={() => setSourceTag(null)}>
            <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{SOURCES[sourceTag].name}</h2>
              <p className="src-desc">{SOURCES[sourceTag].desc}</p>
              <div className="fb-actions">
                {SOURCES[sourceTag].url && (
                  <a
                    className="btn btn-secondary"
                    href={SOURCES[sourceTag].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Learn more ↗
                  </a>
                )}
                <button className="btn" onClick={() => setSourceTag(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            rows={2}
            value={input}
            placeholder="e.g. Ran 5k this morning, felt easy. What should I do tomorrow?"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Touch devices: Enter = line break (send button sends).
              // Desktop: Enter sends, Shift+Enter = line break.
              const touch =
                typeof window !== "undefined" &&
                window.matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !touch) {
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
