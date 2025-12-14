"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const presets = [
  { label: "Azure · gpt-4o-mini", value: "gpt-4o-mini", provider: "azure" },
  { label: "Groq · Llama 3.3 70B", value: "llama-3.3-70b-versatile", provider: "groq" },
  { label: "Groq · Llama 3.3 8B", value: "llama-3.3-8b-instant", provider: "groq" },
];

function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function Page() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [sessionName, setSessionName] = useState("New chat");
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Idle");
  const [provider, setProvider] = useState("azure");
  const [model, setModel] = useState(presets[0].value);
  const [healthOk, setHealthOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState("light");
  const chatWindowRef = useRef(null);

  useEffect(() => {
    checkHealth();
    loadSessions();
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      applyTheme(stored);
      setTheme(stored);
    } else {
      applyTheme("light");
    }
  }, []);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [history]);

  const apiFetch = async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  };

  const checkHealth = async () => {
    setStatus("Checking health...");
    try {
      await apiFetch("/health");
      setHealthOk(true);
      setStatus("Ready");
    } catch (err) {
      setHealthOk(false);
      setStatus(err.message || "Health check failed");
    }
  };

  const loadSessions = async () => {
    try {
      const data = await apiFetch("/sessions");
      setSessions(data.sessions || []);
      if (!sessionId && data.sessions?.length) {
        await openSession(data.sessions[0].id);
      }
    } catch (err) {
      setStatus("Could not load sessions");
    }
  };

  const openSession = async (id) => {
    setStatus("Loading session...");
    try {
      const data = await apiFetch(`/sessions/${id}`);
      setSessionId(data.session.id);
      setSessionName(data.session.name);
      setHistory(data.history || []);
      setStatus("Ready");
    } catch (err) {
      setStatus(err.message || "Failed to load session");
    }
  };

  const newChat = async () => {
    setStatus("Creating chat...");
    try {
      const data = await apiFetch("/sessions", { method: "POST" });
      setSessionId(data.id);
      setSessionName(data.name);
      setHistory([]);
      setInput("");
      await loadSessions();
      setStatus("Ready");
    } catch (err) {
      setStatus(err.message || "Could not create chat");
    }
  };

  const renameSession = async (id, name) => {
    if (!name.trim()) return;
    try {
      await apiFetch(`/sessions/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await loadSessions();
      if (id === sessionId) setSessionName(name);
    } catch (err) {
      setStatus(err.message || "Rename failed");
    }
  };

  const deleteSession = async (id) => {
    try {
      await apiFetch(`/sessions/${id}`, { method: "DELETE" });
      if (id === sessionId) {
        setSessionId(null);
        setSessionName("New chat");
        setHistory([]);
      }
      await loadSessions();
    } catch (err) {
      setStatus(err.message || "Delete failed");
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatus("Sending...");
    const optimisticHistory = [...history, { role: "user", content: trimmed }];
    setHistory(optimisticHistory);
    setInput("");
    try {
      const payload = {
        query: trimmed,
        backend: provider,
        model,
        return_contexts: false,
      };
      if (sessionId) payload.session_id = sessionId;
      if (sessionName) payload.session_name = sessionName;
      const data = await apiFetch("/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSessionId(data.session_id);
      setSessionName(data.session_name || sessionName);
      await openSession(data.session_id);
      await loadSessions();
      setStatus("Ready");
    } catch (err) {
      setStatus(err.message || "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  const currentPresetLabel = useMemo(() => {
    const match = presets.find((p) => p.value === model && p.provider === provider);
    return match?.label;
  }, [model, provider]);

  const applyTheme = (next) => {
    document.body.classList.remove("theme-dark", "theme-light");
    document.body.classList.add(`theme-${next}`);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem("theme", next);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="page">
      <aside className="sidebar panel">
        <div className="header">
          <div>
            <div className="pill">
              <span className={`dot ${healthOk ? "ok" : healthOk === false ? "bad" : ""}`} />
              {healthOk === false ? "Backend offline" : "Backend ready"}
            </div>
            <p className="small" style={{ margin: "6px 0 0" }}>
              Sessions
            </p>
          </div>
          <button className="button secondary" onClick={newChat}>
            New chat
          </button>
        </div>
        <div className="session-list">
          {sessions.length === 0 ? (
            <p className="small">No conversations yet.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`session-card ${s.id === sessionId ? "active" : ""}`}
                onClick={() => openSession(s.id)}
              >
                <div className="header" style={{ gap: 6 }}>
                  <p className="session-title" style={{ flex: 1 }}>{s.name || "Conversation"}</p>
                  <button
                    className="button secondary"
                    style={{ padding: "6px 8px", minWidth: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = prompt("Rename chat", s.name || "Conversation");
                      if (next !== null) renameSession(s.id, next);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="button secondary"
                    style={{ padding: "6px 8px", minWidth: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this chat?")) deleteSession(s.id);
                    }}
                  >
                    🗑
                  </button>
                </div>
                <div className="session-meta">{relativeTime(s.updated_at || s.created_at)}</div>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="panel">
        <div className="header" style={{ marginBottom: 12 }}>
          <div className="title">
            <div className="pill">NepEd Bot</div>
            <h2 style={{ margin: 0 }}>{sessionName}</h2>
          </div>
          <div className="controls" style={{ justifyContent: "flex-end" }}>
            <button className="button secondary" onClick={toggleTheme}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <div className="small status-line">{status}</div>
          </div>
        </div>

        <div className="model-picker">
          <div>
            <label className="small">Provider</label>
            <select
              className="select"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                const preset = presets.find((p) => p.provider === e.target.value);
                if (preset) setModel(preset.value);
              }}
            >
              <option value="groq">Groq</option>
              <option value="azure">Azure OpenAI</option>
            </select>
          </div>
          <div>
            <label className="small">Model / deployment</label>
            <input
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="llama-3.3-70b-versatile or your Azure deployment"
              list="model-presets"
            />
            <datalist id="model-presets">
              {presets.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </datalist>
            {currentPresetLabel && <p className="small" style={{ marginTop: 6 }}>{currentPresetLabel}</p>}
          </div>
        </div>

        <div className="chat-shell">
          <div className="chat-window" ref={chatWindowRef}>
            {history.length === 0 ? (
              <p className="small">Ask anything to start.</p>
            ) : (
              history.map((turn, idx) => (
                <div key={idx} className={`bubble ${turn.role === "user" ? "user" : "bot"}`}>
                  <h4>{turn.role === "user" ? "You" : "NepEd Bot"}</h4>
                  <div>{turn.content}</div>
                </div>
              ))
            )}
          </div>
          <div className="composer">
            <textarea
              className="textarea"
              placeholder="Message NepEd Bot"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="button" onClick={sendMessage} disabled={busy || !input.trim()}>
              {busy ? "Sending..." : "Send"}
            </button>
          </div>
          <p className="small">Enter to send · Shift+Enter for a new line</p>
        </div>
      </main>
    </div>
  );
}
