const express = require("express");
const Story = require("../models/story");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;

    const story = new Story({
      user: req.user.id,
      content,
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