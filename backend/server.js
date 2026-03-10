const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();


const app = express();

app.use(cors());
app.use(express.json());



const authRoutes = require("./routes/auth")
app.use("/api/auth", authRoutes);

console.log("Auth routes loaded");

app.get("/", (req, res) => {
  res.send("UniVerse API is running...");
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

  const authMiddleware = require("./middleware/authMiddleware");

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "You accessed protected route",
    user: req.user
  });
});

const postRoutes = require("./routes/post");
app.use("/api/posts", postRoutes);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const storyRoutes = require("./routes/story");
app.use("/api/stories", storyRoutes);
const cron = require("node-cron");
const Story = require("./models/story");

cron.schedule("0 * * * *", async () => {
  await Story.deleteMany({ expiresAt: { $lt: new Date() } });
  console.log("Expired stories deleted");
});