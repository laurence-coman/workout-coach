"use client";

import { useState } from "react";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    const text = note.trim();
    if (!text) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: text }),
    });
    setNote("");
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setOpen(false);
    }, 1100);
  }

  return (
    <>
      <button
        className="fb-fab"
        title="App feedback"
        onClick={() => setOpen(true)}
        aria-label="App feedback"
      >
        💡
      </button>
      {open && (
        <div className="modal-scrim" onClick={() => setOpen(false)}>
          <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
            <h2>App feedback</h2>
            <p className="hint">
              Ideas, bugs, rough edges - saved to the dev queue for the next
              build session.
            </p>
            <textarea
              autoFocus
              rows={4}
              value={note}
              placeholder="e.g. The dashboard chart should show miles per week"
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="fb-actions">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn" onClick={submit} disabled={!note.trim()}>
                {sent ? "Saved ✓" : "Save note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
