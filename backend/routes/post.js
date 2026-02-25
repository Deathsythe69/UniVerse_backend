const express = require("express");
const Post = require("../models/Post");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();


// 1️⃣ Create Post (Student only)
router.post("/", authMiddleware, roleMiddleware(["student"]), async (req, res) => {
  try {
    const { content } = req.body;

    const newPost = new Post({
      user: req.user.id,
      content
    });

    await newPost.save();

    res.json({ message: "Post created. Awaiting approval." });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// 2️⃣ Get Approved Posts (Public Feed)
router.get("/", async (req, res) => {
  try {
    const posts = await Post.find({ isApproved: true })
      .populate("user", "name");

    res.json(posts);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// 3️⃣ Approve Post (Moderator only)
router.put("/approve/:id",
  authMiddleware,
  roleMiddleware(["moderator", "supervisor"]),
  async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);

      if (!post) return res.status(404).json({ message: "Post not found" });

      post.isApproved = true;
      await post.save();

      res.json({ message: "Post approved." });

    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);


// 4️⃣ Reject/Delete Post (Moderator or Supervisor)
router.delete("/:id",
  authMiddleware,
  roleMiddleware(["moderator", "supervisor"]),
  async (req, res) => {
    try {
      await Post.findByIdAndDelete(req.params.id);
      res.json({ message: "Post deleted." });

    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);


router.put("/like/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ message: "Post not found" });

    const userId = req.user.id;

    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      // Unlike
      post.likes = post.likes.filter(id => id.toString() !== userId);
    } else {
      // Like
      post.likes.push(userId);
    }

    await post.save();

    res.json({
      message: alreadyLiked ? "Post unliked" : "Post liked",
      totalLikes: post.likes.length
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/comment/:id", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;

    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments.push({
      user: req.user.id,
      text
    });

    await post.save();

    res.json({ message: "Comment added" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.put("/report/:id", authMiddleware, roleMiddleware(["student"]), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ message: "Post not found" });

    if (!post.reports.includes(req.user.id)) {
      post.reports.push(req.user.id);
      await post.save();
    }

    res.json({ message: "Post reported." });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;