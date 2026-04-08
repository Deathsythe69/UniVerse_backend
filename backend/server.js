const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const authMiddleware = require("./middleware/authMiddleware");
const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/post");
const userRoutes = require("./routes/user");
const storyRoutes = require("./routes/story");
const messageRoutes = require("./routes/message");
const eventRoutes = require("./routes/event");

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/events", eventRoutes);

app.get("/", (req, res) => {
  res.send("UniVerse API is running with Socket.io...");
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// --- Socket.IO Logic ---
let users = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  
  socket.on("addUser", (userId) => {
    users[userId] = socket.id;
    io.emit("getUsers", Object.keys(users));
  });

  socket.on("sendMessage", ({ senderId, receiverId, text, conversationId }) => {
    const userSocket = users[receiverId];
    if (userSocket) {
      io.to(userSocket).emit("getMessage", {
        sender: senderId,
        text,
        conversationId,
        createdAt: new Date()
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
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
  console.log("Expired stories deleted");
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});