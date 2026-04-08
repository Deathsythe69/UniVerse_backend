const express = require("express");
const Post = require("../models/Post");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

const router = express.Router();


// 1️⃣ Create Post (Anyone can post now without approval - wait, roleMiddleware wasn't changed but I will change it if user meant anyone)
// Actually the prompt said "anyone can post without any approval". I should remove roleMiddleware(["student"]) to allow anyone to post.
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { content, repostOf } = req.body;
    let imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newPost = new Post({
      user: req.user.id,
      content: content || "",
      image: imageUrl,
      repostOf: repostOf || null,
      isApproved: true // Ensure it's approved by default here too
    });

    await newPost.save();

    res.json({ message: "Post created successfully.", post: newPost });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// 1.5️⃣ Get Leaderboard (Weekly Top Stars)
router.get("/leaderboard", authMiddleware, async (req, res) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const posts = await Post.find({ isApproved: true, createdAt: { $gte: oneWeekAgo } })
      .populate("user", "name avatar role");
    
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

    // Sort descending by highest likes and take top 10
    const leaderboard = Object.values(userHighestLikes).sort((a,b) => b.highestLikes - a.highestLikes).slice(0, 10);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 1.8️⃣ Search Posts
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const posts = await Post.find({
      isApproved: true,
      content: { $regex: q, $options: "i" } // Case-insensitive search on content
    })
      .populate("user", "name avatar")
      .populate({
        path: "repostOf",
        populate: { path: "user", select: "name avatar" }
      })
      .sort({ createdAt: -1 });

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2️⃣ Get Approved Posts (Public Feed)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find({ isApproved: true })
      .populate("user", "name avatar")
      .populate({
        path: "repostOf",
        populate: { path: "user", select: "name avatar" }
      })
      .sort({ createdAt: -1 });

    res.json(posts);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2.5️⃣ Get Single Post
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("user", "name avatar")
      .populate({
        path: "repostOf",
        populate: { path: "user", select: "name avatar" }
      });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);
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

// 3.1️⃣ Get Pending Posts (Moderator/Supervisor only)
router.get("/pending",
  authMiddleware,
  roleMiddleware(["moderator", "supervisor"]),
  async (req, res) => {
    try {
      const posts = await Post.find({ isApproved: false })
        .populate("user", "name");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// 3.2️⃣ Get Reported Posts (Moderator/Supervisor only)
router.get("/reported",
  authMiddleware,
  roleMiddleware(["moderator", "supervisor"]),
  async (req, res) => {
    try {
      const posts = await Post.find({ "reports.0": { $exists: true } })
        .populate("user", "name")
        .populate("reports", "name");
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// 3.3️⃣ Dismiss Reports on Post (Moderator/Supervisor only)
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

    // Fix: Convert ObjectIds to strings for correct comparison
    const alreadyLiked = post.likes.map(id => id.toString()).includes(userId);

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

    if (!text || text.trim() === "") {
        return res.status(400).json({ message: "Comment text cannot be empty" });
    }

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

    // Fix: Convert ObjectIds to strings for accurate includes comparison
    if (!post.reports.map(id => id.toString()).includes(req.user.id)) {
      post.reports.push(req.user.id);
      await post.save();
    }

    res.json({ message: "Post reported." });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;