const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PendingUser = require("../models/PendingUser");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const authMiddleware = require("../middleware/authMiddleware");


const router = express.Router();


// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Only university email allowed
    if (!email || !email.endsWith("@gmail.com")) {
      return res.status(400).json({ message: "Use university email only" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Check if there's already a pending user
    let pendingUser = await PendingUser.findOne({ email });
    if (pendingUser) {
      pendingUser.name = name;
      pendingUser.password = hashedPassword;
      pendingUser.otp = otp;
      pendingUser.otpExpiry = otpExpiry;
      await pendingUser.save();
    } else {
      pendingUser = new PendingUser({
        name,
        email,
        password: hashedPassword,
        otp,
        otpExpiry
      });
      await pendingUser.save();
    }

    // Send OTP email
    try {
      await sendEmail({
        email: pendingUser.email,
        subject: "Verify Your Email - UniVerse",
        message: `Your One-Time Password (OTP) for UniVerse registration is: ${otp}\nThis OTP is valid for 10 minutes.`
      });
    } catch(err) {
      console.log("OTP Email failed", err);
    }

    res.json({ message: "Verification OTP sent. Please check email to complete registration." });

  } catch (error) {
  console.log(error);
  res.status(500).json({ message: error.message });
}
});


// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.isBlacklisted) {
      return res.status(403).json({ message: "Your account has been suspended." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role
      }
    });

  }catch (error) {
  console.log(error);
  res.status(500).json({ message: error.message });
}
});

// GOOGLE LOGIN
router.post("/google", async (req, res) => {
  try {
    const { name, email, googleId } = req.body;
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user without password
      user = new User({
        name,
        email,
        googleId,
        isEmailVerified: true // Google accounts are implicitly verified
      });
      await user.save();
    }

    if (user.isBlacklisted) {
      return res.status(403).json({ message: "Your account has been suspended." });
    }
    
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    
    res.json({
      token,
      user: { id: user._id, name: user.name, role: user.role }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
});

// VERIFY EMAIL OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const pendingUser = await PendingUser.findOne({ email });
    if (!pendingUser) return res.status(400).json({ message: "No pending registration found or OTP expired" });

    if (pendingUser.otp !== otp || pendingUser.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // OTP fits, create the real user now!
    const user = new User({
      name: pendingUser.name,
      email: pendingUser.email,
      password: pendingUser.password,
      isEmailVerified: true
    });
    
    await user.save();

    // Remove from pending collection
    await PendingUser.deleteOne({ email });

    res.json({ message: "Email successfully verified. You can now login, user created." });
  } catch(error) {
    res.status(500).json({ message: error.message });
  }
});

// FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No user with that email" });

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
    const message = `You requested a password reset.\n\nPlease go to this link to reset your password:\n${resetUrl}`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Password Reset Token - UniVerse",
        message
      });
      res.json({ message: "Email sent" });
    } catch (error) {
      console.error("Forgot Password Email Error:", error);
      user.resetPasswordToken = null;
      user.resetPasswordExpiry = null;
      await user.save();
      return res.status(500).json({ message: "Email could not be sent: " + error.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// RESET PASSWORD
router.put("/reset-password/:token", async (req, res) => {
  try {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpiry: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = await bcrypt.hash(req.body.password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpiry = null;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET PROFILE
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp -resetPasswordToken");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// SET UP MULTER FOR PROFILE PICTURE
const multer = require("multer");
const path = require("path");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// UPDATE PROFILE
router.put("/profile", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    const { name, bio } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    
    if (req.file) {
      user.avatar = `/uploads/${req.file.filename}`;
    } else if (req.body.avatar) {
      user.avatar = req.body.avatar; // Keep fallback if a url is sent directly
    }

    await user.save();
    
    res.json({ 
      message: "Profile updated successfully", 
      user: { id: user._id, name: user.name, role: user.role, bio: user.bio, avatar: user.avatar } 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;