const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const sendEmail = require("../utils/sendEmail");
const upload = require("../middleware/upload");

const router = express.Router();

// --- Static routes MUST come before /:id param routes ---

// Create Post
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { content } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newPost = new Post({
      user: req.user.id,
      content: content || "",
      image: imageUrl,
      isApproved: true
    });

    await newPost.save();
    res.json({ message: "Post created successfully.", post: newPost });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Leaderboard (Weekly Top Stars)
router.get("/leaderboard", authMiddleware, async (req, res) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const posts = await Post.find({ isApproved: true, createdAt: { $gte: oneWeekAgo } })
      .populate("user", "name avatar role")
      .lean();

    const userHighestLikes = {};
    posts.forEach(p => {
      const u = p.user;
      if (!u) return;
      if (!userHighestLikes[u._id]) {
        userHighestLikes[u._id] = { user: u, highestLikes: 0, bestPostId: null };
      }
      if (p.likes.length >= userHighestLikes[u._id].highestLikes) {
        userHighestLikes[u._id].highestLikes = p.likes.length;
        userHighestLikes[u._id].bestPostId = p._id;
      }
    });

    const leaderboard = Object.values(userHighestLikes)
      .sort((a, b) => b.highestLikes - a.highestLikes)
      .slice(0, 10);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Search Posts
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const posts = await Post.find({
      isApproved: true,
      content: { $regex: q, $options: "i" }
    })
      .populate("user", "name avatar")
      .populate("comments.user", "name avatar")
      .sort({ createdAt: -1 })
      .lean();

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Pending Posts (Moderator/Supervisor only) — BEFORE /:id
router.get("/pending",
  authMiddleware,
  roleMiddleware(["moderator", "supervisor"]),
  async (req, res) => {
    try {
      const posts = await Post.find({ isApproved: false }).populate("user", "name");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get Reported Posts (Moderator/Supervisor only) — BEFORE /:id
router.get("/reported",
  authMiddleware,
  roleMiddleware(["moderator", "supervisor"]),
  async (req, res) => {
    try {
      const posts = await Post.find({ "reports.0": { $exists: true } })
        .populate("user", "name")
        .populate("reports.user", "name avatar");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get Approved Posts (Public Feed)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find({ isApproved: true })
      .populate("user", "name avatar")
      .populate("comments.user", "name avatar")
      .sort({ createdAt: -1 })
      .lean();

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Single Post — AFTER all static /word routes
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("user", "name avatar")
      .populate("comments.user", "name avatar");

    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Approve Post (Moderator/Supervisor)
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

// Dismiss Reports (Moderator/Supervisor)
router.put("/dismiss-reports/:id",
  authMiddleware,
  roleMiddleware(["moderator", "supervisor"]),
  async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);
      if (!post) return res.status(404).json({ message: "Post not found" });

      post.reports = [];
      await post.save();
      res.json({ message: "Reports dismissed." });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete Post (Author, Moderator, or Supervisor)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const isAuthor = post.user && post.user.toString() === req.user.id;
    const isModOrSupervisor = req.user.role && ["moderator", "supervisor"].includes(req.user.role);

    if (!isAuthor && !isModOrSupervisor) {
      return res.status(403).json({ message: "Unauthorized to delete this post" });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Like / Unlike Post
router.put("/like/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const userId = req.user.id;
    const alreadyLiked = post.likes.map(id => id.toString()).includes(userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter(id => id.toString() !== userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();
    res.json({ message: alreadyLiked ? "Post unliked" : "Post liked", totalLikes: post.likes.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add Comment
router.post("/comment/:id", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim() === "") return res.status(400).json({ message: "Comment text cannot be empty" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments.push({ user: req.user.id, text });
    await post.save();
    res.json({ message: "Comment added" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Report Post
router.put("/report/:id", authMiddleware, async (req, res) => {
  try {
    const { reason, details } = req.body;
    const post = await Post.findById(req.params.id).populate("user", "name email");
    if (!post) return res.status(404).json({ message: "Post not found" });

    const hasReported = post.reports.find(r =>
      (r.user && r.user.toString() === req.user.id) || (r.toString() === req.user.id)
    );

    if (!hasReported) {
      post.reports.push({ user: req.user.id, reason: reason || "Inappropriate", details: details || "" });
      
      if (post.reports.length >= 3) {
        post.isApproved = false;
      }
      await post.save();

      if (post.reports.length >= 3) {
        const moderators = await User.find({ role: "moderator" });
        const modEmails = moderators.map(m => m.email).join(",");

        if (modEmails) {
          try {
            await sendEmail({
              email: modEmails,
              subject: "Alert: Heavily Reported Post on UniVerse",
              message: `A post by ${post.user.name} has been reported by 3 users.\n\nPost Content:\n${post.content}`
            });
          } catch (e) {
            console.error("Failed to send moderation alert email", e.message);
          }
        }
      }
    }

    res.json({ message: "Post reported." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;