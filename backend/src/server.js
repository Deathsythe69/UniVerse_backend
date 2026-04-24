const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require("http");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CLIENT_URL || "http://localhost:3000";

const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] }
});

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true });
app.use("/api/", apiLimiter);
const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/post");
const userRoutes = require("./routes/user");
const storyRoutes = require("./routes/story");
const messageRoutes = require("./routes/message");
const eventRoutes = require("./routes/event");
const adminRoutes = require("./routes/admin");

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("UniVerse API is running with Socket.io...");
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => { console.error("MongoDB connection error:", err.message); process.exit(1); });

// --- Socket.IO Logic ---
let users = {};

io.on("connection", (socket) => {
  // User connected
  
  socket.on("addUser", (userId) => {
    users[userId] = socket.id;
    io.emit("getUsers", Object.keys(users));
  });

  socket.on("sendMessage", ({ senderId, receiverId, text, conversationId, messageId }) => {
    const userSocket = users[receiverId];
    if (userSocket) {
      io.to(userSocket).emit("getMessage", {
        _id: messageId,
        sender: senderId,
        text,
        status: "delivered", // Immediately ping as delivered
        conversationId,
        createdAt: new Date()
      });
      // Ping sender back that message was delivered
      const senderSocket = users[senderId];
      if (senderSocket) io.to(senderSocket).emit("messageStatusUpdate", { messageId, status: "delivered" });
    }
  });

  socket.on("updateMessageStatus", ({ senderId, receiverId, messageId, status }) => {
    const senderSocket = users[senderId];
    if (senderSocket) {
      io.to(senderSocket).emit("messageStatusUpdate", { messageId, status });
    }
  });

  socket.on("disconnect", () => {
    // User disconnected
    for (let [id, sId] of Object.entries(users)) {
      if (sId === socket.id) {
        delete users[id];
        break;
      }
    }
    io.emit("getUsers", Object.keys(users));
  });
});

// --- Cron Jobs ---
const cron = require("node-cron");
const Story = require("./models/story");

cron.schedule("0 * * * *", async () => {
  await Story.deleteMany({ expiresAt: { $lt: new Date() } });
});

// Register the cron job for BPUT auto scraping every 6 hours
const scrapeBPUT = require("./utils/scraper");
cron.schedule("0 */6 * * *", async () => {
  await scrapeBPUT();
});

// Centralized error handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});