const express = require("express");
const Event = require("../models/Event");
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

router.get("/", authMiddleware, async (req, res) => {
  try {
    const events = await Event.find({ date: { $gte: new Date() } }).sort({ date: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", authMiddleware, roleMiddleware(["admin", "moderator", "supervisor"]), upload.single("image"), async (req, res) => {
  try {
    const { title, description, type, date, location, organizer } = req.body;
    let imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    const event = new Event({
      title, description, type, date, location, organizer, image: imageUrl
    });
    
    await event.save();
    res.json({ message: "Event created", event });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
