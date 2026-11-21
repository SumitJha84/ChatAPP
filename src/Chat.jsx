import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, socketUrl } from "./api.js";

const ADMIN_CONTACT = { name: "ChatSpace Admin", phone: "8448848514", email: "sjha44812@gmail.com" };

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Avatar({ name = "C", size = "normal" }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <div className={`grid shrink-0 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-800 ${size === "large" ? "h-12 w-12 text-base" : "h-11 w-11 text-sm"}`}>{initials}</div>;
}

function MessageList({ messages, role }) {
  const bottomRef = useRef(null);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-6 sm:px-8">
      {!messages.length && <div className="mx-auto mt-10 max-w-xs rounded-xl bg-white/80 px-5 py-4 text-center text-sm text-slate-500 shadow-sm">This is the beginning of your conversation. Say hello!</div>}
      {messages.map((message) => {
        const mine = role === message.senderRole;
        return <div key={message._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm sm:max-w-[70%] ${mine ? "rounded-br-md bg-emerald-100 text-slate-800" : "rounded-bl-md bg-white text-slate-800"}`}>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-6">{message.text}</p>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
              <span>{timeLabel(message.createdAt)}</span>
              {mine && role === "admin" && message.isRead && <span aria-label="Read">✓✓</span>}
            </div>
          </div>
        </div>;
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function Composer({ onSend }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSend(text.trim());
      setText("");
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="flex items-end gap-3 border-t border-slate-100 bg-white px-3 py-3 sm:px-6">
    <textarea aria-label="Message" rows="1" maxLength="4000" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} placeholder="Write a message…" className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-emerald-300" />
    <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-xl text-white transition hover:bg-emerald-600 disabled:opacity-50" aria-label="Send message" disabled={busy || !text.trim()}>➤</button>
  </form>;
}

function AdminChat({ token, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const selected = conversations.find((conversation) => conversation.id === selectedId);

  const loadConversations = useCallback(async () => {
    const data = await api("/api/admin/conversations", { token });
    setConversations(data);
  }, [token]);

  const loadMessages = useCallback(async (id) => {
    const data = await api(`/api/admin/conversations/${id}/messages`, { token });
    setMessages(data);
    setConversations((items) => items.map((item) => item.id === id ? { ...item, unreadCount: 0 } : item));
  }, [token]);

  useEffect(() => { loadConversations().catch((err) => setError(err.message)); }, [loadConversations]);
  useEffect(() => {
    if (selectedId) loadMessages(selectedId).catch((err) => setError(err.message));
    else setMessages([]);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const socket = io(socketUrl(), { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("message:new", (message) => {
      if (message.conversationId === selectedId) {
        setMessages((items) => items.some((item) => item._id === message._id) ? items : [...items, message]);
      }
    });
    socket.on("conversation:update", (update) => {
      setConversations((items) => {
        const existing = items.find((item) => item.id === update.id);
        const unreadCount = update.senderRole === "user" && update.id !== selectedId
          ? (existing?.unreadCount || 0) + 1
          : existing?.unreadCount || 0;
        const next = { ...existing, ...update, unreadCount };
        return [next, ...items.filter((item) => item.id !== update.id)].sort(
          (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt),
        );
      });
    });
    socket.on("connect_error", (err) => setError(err.message));
    return () => socket.disconnect();
  }, [token, selectedId]);

  async function send(text) {
    setError("");
    try {
      const message = await api(`/api/admin/conversations/${selectedId}/messages`, {
        token, method: "POST", body: JSON.stringify({ text }),
      });
      setMessages((items) => items.some((item) => item._id === message._id) ? items : [...items, message]);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  const visible = useMemo(() => conversations.filter((item) =>
    `${item.user?.name || ""} ${item.user?.phone || ""}`.toLowerCase().includes(search.toLowerCase()),
  ), [conversations, search]);

  return <main className="h-screen min-h-[480px] bg-[#e9efec] p-0 sm:p-5 lg:p-8">
    <div className="mx-auto flex h-full max-w-[1500px] overflow-hidden bg-white shadow-xl shadow-slate-900/10 sm:rounded-2xl">
      <aside className={`${selectedId ? "hidden sm:flex" : "flex"} w-full shrink-0 flex-col border-r border-slate-200 sm:w-[340px] lg:w-[390px]`}>
        <header className="flex h-[76px] items-center justify-between bg-[#f7f9f8] px-5">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 font-bold text-white">C</div><div><h1 className="font-bold text-slate-900">ChatSpace</h1><p className="text-xs text-slate-500">Admin inbox</p></div></div>
          <button onClick={onLogout} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-800">Sign out</button>
        </header>
        <div className="border-b border-slate-100 p-3"><div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3"><span className="text-slate-400" aria-hidden="true">⌕</span><input aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></div></div>
        {error && <div role="alert" className="mx-3 mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
        <div className="flex-1 overflow-y-auto">
          {!visible.length && <p className="px-6 py-10 text-center text-sm text-slate-400">{search ? "No matching conversations." : "No conversations yet."}</p>}
          {visible.map((conversation) => <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${selectedId === conversation.id ? "bg-slate-100" : ""}`}>
            <Avatar name={conversation.user?.name || "Visitor"} />
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-slate-800">{conversation.user?.name || "Visitor"}</span><span className="shrink-0 text-[11px] text-slate-400">{timeLabel(conversation.lastMessageAt)}</span></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{conversation.lastMessage || conversation.user?.phone}</span>{conversation.unreadCount > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">{conversation.unreadCount}</span>}</span></span>
          </button>)}
        </div>
      </aside>
      <section className={`${selectedId ? "flex" : "hidden sm:flex"} min-w-0 flex-1 flex-col`}>
        {selected ? <>
          <header className="flex h-[76px] items-center gap-3 border-b border-slate-100 bg-white px-4 sm:px-6">
            <button onClick={() => setSelectedId(null)} className="mr-1 text-xl text-slate-500 sm:hidden" aria-label="Back to conversations">‹</button>
            <Avatar name={selected.user?.name || "Visitor"} />
            <div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{selected.user?.name}</h2><p className="text-xs text-slate-500">{selected.user?.phone}</p></div>
          </header>
          {error && <p role="alert" className="bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
          <div className="chat-wallpaper flex min-h-0 flex-1 flex-col"><MessageList messages={messages} role="admin" /></div>
          <Composer onSend={send} />
        </> : <div className="hidden flex-1 flex-col items-center justify-center bg-[#f7f9f8] text-center sm:flex"><div className="grid h-20 w-20 place-items-center rounded-3xl bg-emerald-100 text-3xl text-emerald-700">C</div><h2 className="mt-5 text-xl font-semibold text-slate-700">Your messages, all in one place</h2><p className="mt-2 text-sm text-slate-500">Select a conversation to start chatting.</p></div>}
      </section>
    </div>
  </main>;
}

function VisitorChat({ token, session, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");

  const loadMessages = useCallback(async () => {
    const data = await api("/api/chat/messages", { token });
    setMessages(data);
  }, [token]);

  useEffect(() => { loadMessages().catch((err) => setError(err.message)); }, [loadMessages]);
  useEffect(() => {
    const socket = io(socketUrl(), { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("message:new", (message) => {
      setMessages((items) => items.some((item) => item._id === message._id) ? items : [...items, message]);
    });
    socket.on("connect_error", (err) => setError(err.message));
    return () => socket.disconnect();
  }, [token]);

  async function send(text) {
    setError("");
    try {
      const message = await api("/api/chat/messages", { token, method: "POST", body: JSON.stringify({ text }) });
      setMessages((items) => items.some((item) => item._id === message._id) ? items : [...items, message]);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  return <main className="flex h-screen min-h-[480px] flex-col bg-white sm:mx-auto sm:max-w-3xl sm:shadow-xl">
    <header className="flex min-h-[76px] items-center gap-3 bg-[#f7f9f8] px-4 shadow-sm sm:px-6">
      <Avatar name="ChatSpace Admin" />
      <div className="min-w-0 flex-1"><h1 className="font-semibold text-slate-900">{ADMIN_CONTACT.name}</h1><p className="truncate text-xs text-slate-500">{ADMIN_CONTACT.phone} · {ADMIN_CONTACT.email}</p></div>
      <button onClick={onLogout} className="text-xs font-medium text-slate-500 hover:text-rose-600">Sign out</button>
    </header>
    {error && <p role="alert" className="bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
    <div className="chat-wallpaper flex min-h-0 flex-1 flex-col"><MessageList messages={messages} role="user" /></div>
    <Composer onSend={send} />
    <p className="bg-white py-1 text-center text-[10px] text-slate-400">Chatting as {session.user?.name}</p>
  </main>;
}

export default function Chat({ token, session, onLogout }) {
  return session.role === "admin"
    ? <AdminChat token={token} onLogout={onLogout} />
    : <VisitorChat token={token} session={session} onLogout={onLogout} />;
}
