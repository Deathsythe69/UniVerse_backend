const express = require("express");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/conversation", authMiddleware, async (req, res) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user.id;

    let conversation = await Conversation.findOne({
      members: { $all: [senderId, receiverId] }
    });

    if (!conversation) {
      const receiver = await User.findById(receiverId);
      const sender = await User.findById(senderId);
      
      // Block System
      if (receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
        return res.status(403).json({ message: "Cannot message. This user has blocked you." });
      }
      
      const isMutual = receiver.following.includes(senderId) && sender.following.includes(receiverId);
      
      conversation = new Conversation({
        members: [senderId, receiverId],
        isRequest: !isMutual
      });
      await conversation.save();
    } else {
      // Re-check block logic if convo exists
      const receiver = await User.findById(receiverId);
      if (receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
        return res.status(403).json({ message: "Cannot message. This user has blocked you." });
      }
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      members: { $in: [req.user.id] }
    })
    .populate("members", "name avatar role")
    .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:conversationId", authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({
      conversationId: req.params.conversationId
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { conversationId, text, receiverId } = req.body;

    const message = new Message({
      conversationId,
      sender: req.user.id,
      text,
      status: "delivered" // Socket handles real-time delivery
    });
    
    await message.save();

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: { text, sender: req.user.id, seen: false }
    });

    res.json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark messages as seen
router.put("/seen/:conversationId", authMiddleware, async (req, res) => {
  try {
    await Message.updateMany(
      { conversationId: req.params.conversationId, sender: { $ne: req.user.id }, status: { $ne: "seen" } },
      { $set: { status: "seen", read: true } }
    );
    await Conversation.findOneAndUpdate(
      { _id: req.params.conversationId, "lastMessage.sender": { $ne: req.user.id } },
      { $set: { "lastMessage.seen": true } }
    );
    res.json({ message: "Messages marked as seen" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/accept/:conversationId", authMiddleware, async (req, res) => {
  try {
    const convo = await Conversation.findByIdAndUpdate(
      req.params.conversationId, 
      { isRequest: false }, 
      { new: true }
    );
    res.json(convo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
