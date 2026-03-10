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
router.get("/", authMiddleware, async (req, res) => {
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