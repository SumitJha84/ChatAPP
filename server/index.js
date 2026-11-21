import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { rateLimit } from "express-rate-limit";
import { Conversation, Message, User } from "./models.js";

const required = ["MONGODB_URI", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
});
const PORT = process.env.PORT || 4000;
const ADMIN_ID = "admin";

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "16kb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
const messageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30 });

function createToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required." });
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

function requireAdmin(req, res, next) {
  if (req.auth?.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  return next();
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function visitorView(user, conversation) {
  return {
    role: "user",
    user: { id: user.id, name: user.name, phone: user.phone },
    conversationId: conversation.id,
  };
}

async function findVisitorConversation(req) {
  if (req.auth.role !== "user" || !mongoose.isValidObjectId(req.auth.userId)) return null;
  return Conversation.findOne({ userId: req.auth.userId });
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/visitor", authLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    if (name.length < 2 || name.length > 100 || !/^[+\d\s().-]{7,30}$/.test(phone)) {
      return res.status(400).json({ error: "Enter a name and a valid phone number." });
    }
    const user = await User.create({ name, phone });
    const conversation = await Conversation.create({ userId: user.id });
    return res.status(201).json({
      token: createToken({ role: "user", userId: user.id }),
      session: visitorView(user, conversation),
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/admin", authLimiter, (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!safeEqual(email, process.env.ADMIN_EMAIL) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  return res.json({
    token: createToken({ role: "admin" }),
    session: { role: "admin", user: { name: "ChatSpace Admin", email } },
  });
});

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    if (req.auth.role === "admin") {
      return res.json({ role: "admin", user: { name: "ChatSpace Admin", email: process.env.ADMIN_EMAIL } });
    }
    const user = await User.findById(req.auth.userId);
    const conversation = user && await Conversation.findOne({ userId: user.id });
    if (!user || !conversation) return res.status(401).json({ error: "Visitor session is no longer available." });
    return res.json(visitorView(user, conversation));
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/conversations", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const conversations = await Conversation.find()
      .sort({ lastMessageAt: -1 })
      .populate("userId", "name phone");
    const rows = await Promise.all(conversations.map(async (conversation) => ({
      id: conversation.id,
      user: conversation.userId,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: await Message.countDocuments({
        conversationId: conversation.id,
        senderRole: "user",
        isRead: false,
      }),
    })));
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/conversations/:id/messages", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Conversation not found." });
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    const messages = await Message.find({ conversationId: conversation.id }).sort({ createdAt: 1 });
    await Message.updateMany(
      { conversationId: conversation.id, senderRole: "user", isRead: false },
      { $set: { isRead: true } },
    );
    return res.json(messages);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/chat/messages", requireAuth, async (req, res, next) => {
  try {
    const conversation = await findVisitorConversation(req);
    if (!conversation) return res.status(403).json({ error: "This conversation is not available." });
    const messages = await Message.find({ conversationId: conversation.id }).sort({ createdAt: 1 });
    await Message.updateMany(
      { conversationId: conversation.id, senderRole: "admin", isRead: false },
      { $set: { isRead: true } },
    );
    return res.json(messages);
  } catch (error) {
    return next(error);
  }
});

async function sendMessage({ conversation, senderId, senderRole, text }) {
  const message = await Message.create({
    conversationId: conversation.id,
    senderId,
    senderRole,
    text,
    isRead: false,
  });
  conversation.lastMessage = text;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();
  const populated = await User.findById(conversation.userId).select("name phone");
  io.to(`conversation:${conversation.id}`).emit("message:new", message);
  io.to("admins").emit("message:new", message);
  io.to("admins").emit("conversation:update", {
    id: conversation.id,
    user: populated,
    lastMessage: text,
    lastMessageAt: message.createdAt,
    senderRole,
  });
  return message;
}

app.post("/api/chat/messages", requireAuth, messageLimiter, async (req, res, next) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const conversation = await findVisitorConversation(req);
    if (!conversation) return res.status(403).json({ error: "This conversation is not available." });
    if (!text || text.length > 4000) return res.status(400).json({ error: "Message must be between 1 and 4000 characters." });
    const message = await sendMessage({ conversation, senderId: req.auth.userId, senderRole: "user", text });
    return res.status(201).json(message);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/conversations/:id/messages", requireAuth, requireAdmin, messageLimiter, async (req, res, next) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Conversation not found." });
    if (!text || text.length > 4000) return res.status(400).json({ error: "Message must be between 1 and 4000 characters." });
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    const message = await sendMessage({ conversation, senderId: ADMIN_ID, senderRole: "admin", text });
    return res.status(201).json(message);
  } catch (error) {
    return next(error);
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required."));
    socket.data.auth = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return next(new Error("Invalid or expired session."));
  }
});

io.on("connection", async (socket) => {
  const auth = socket.data.auth;
  if (auth.role === "admin") {
    socket.join("admins");
    return;
  }
  if (auth.role === "user" && mongoose.isValidObjectId(auth.userId)) {
    const conversation = await Conversation.findOne({ userId: auth.userId });
    if (conversation) socket.join(`conversation:${conversation.id}`);
    else socket.disconnect(true);
    return;
  }
  socket.disconnect(true);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
});

await mongoose.connect(process.env.MONGODB_URI);
server.listen(PORT, () => console.log(`ChatSpace API listening on port ${PORT}`));
