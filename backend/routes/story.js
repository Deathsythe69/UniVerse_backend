const express = require("express");
const Story = require("../models/story");
const authMiddleware = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

const router = express.Router();

router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!req.file) return res.status(400).json({ message: "Image is required for a story" });
    
    const imageUrl = `/uploads/${req.file.filename}`;

    const story = new Story({
      user: req.user.id,
      content: content || "",
      image: imageUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await story.save();

    res.json({ message: "Story created" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const stories = await Story.find({ expiresAt: { $gt: new Date() } })
      .populate("user", "name");

    res.json(stories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;