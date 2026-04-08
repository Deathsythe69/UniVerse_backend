const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// FOLLOW / UNFOLLOW USER
router.put("/follow/:id", authMiddleware, async (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ message: "You cannot follow yourself" });
  }
  try {
    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);
    if (!userToFollow || !currentUser) return res.status(404).json({ message: "User not found" });

    // Check if already following
    if (!currentUser.following.includes(req.params.id)) {
      await currentUser.updateOne({ $push: { following: req.params.id } });
      await userToFollow.updateOne({ $push: { followers: req.user.id } });
      res.json({ message: "User followed", isFollowing: true });
    } else {
      await currentUser.updateOne({ $pull: { following: req.params.id } });
      await userToFollow.updateOne({ $pull: { followers: req.user.id } });
      res.json({ message: "User unfollowed", isFollowing: false });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// SEARCH USERS
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    
    // Case-insensitive regex search on name or role
    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { role: { $regex: q, $options: "i" } }
      ]
    }).select("-password -otp -resetPasswordToken");
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
