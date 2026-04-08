const express = require("express");
const User = require("../models/User");
const Post = require("../models/Post");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// GET Admin Dashboard Metrics
router.get("/metrics", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalPosts = await Post.countDocuments();
    
    // Total reports across all posts
    const postsWithReports = await Post.find({ "reports.0": { $exists: true } });
    const totalReports = postsWithReports.reduce((sum, p) => sum + p.reports.length, 0);

    const moderators = await User.find({ role: "moderator" }).select("name email");
    const activeUsers = await User.find().sort({ createdAt: -1 }).limit(10).select("name email isBlacklisted role");

    res.json({
      totalUsers,
      totalPosts,
      totalReports,
      moderators,
      activeUsers
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PROMOTE/DEMOTE Moderator
router.put("/moderator/:id", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  try {
    const { role } = req.body; // "student" or "moderator"
    if (!["student", "moderator"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.role = role;
    await user.save();

    res.json({ message: `User role updated to ${role}` });
  } catch(error) {
    res.status(500).json({ message: error.message });
  }
});

// TOGGLE BLACKLIST
router.put("/blacklist/:id", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isBlacklisted = !user.isBlacklisted;
    await user.save();

    res.json({ message: `User has been ${user.isBlacklisted ? 'blacklisted' : 'whitelisted'}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
