const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const PendingUser = require("../models/PendingUser");
const sendEmail = require("../utils/sendEmail");

// Helpers
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1d" });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || name.trim() === "") return res.status(400).json({ message: "Name is required" });
    if (!password || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters long" });
    if (!email || !email.endsWith("@gmail.com")) return res.status(400).json({ message: "Use university email only" });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000;

    let pendingUser = await PendingUser.findOne({ email });
    if (pendingUser) {
      pendingUser.name = name;
      pendingUser.password = hashedPassword;
      pendingUser.otp = otp;
      pendingUser.otpExpiry = otpExpiry;
      await pendingUser.save();
    } else {
      pendingUser = new PendingUser({ name, email, password: hashedPassword, otp, otpExpiry });
      await pendingUser.save();
    }

    try {
      await sendEmail({
        email: pendingUser.email,
        subject: "Verify Your Email - UniVerse",
        message: `Your One-Time Password (OTP) for UniVerse registration is: ${otp}\nThis OTP is valid for 10 minutes.`,
        otp: otp,
        purpose: "registration"
      });
    } catch(err) {
      console.log("OTP Email failed", err);
    }

    res.json({ message: "Verification OTP sent. Please check email to complete registration." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Login with OTP verification.
 * Step 1: Validate credentials → generate OTP → send via Celery → return otpRequired: true
 * Step 2: Frontend sends email + otp to /verify-login-otp → returns JWT
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    if (user.isBlacklisted) return res.status(403).json({ message: "Your account has been suspended." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Generate login OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.loginOtp = otp;
    user.loginOtpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send OTP via Celery (or Nodemailer fallback)
    try {
      await sendEmail({
        email: user.email,
        subject: "Login Verification OTP - UniVerse",
        message: `Your login OTP is: ${otp}\nThis OTP is valid for 10 minutes.`,
        otp: otp,
        purpose: "login"
      });
    } catch (err) {
      console.log("Login OTP email failed:", err);
    }

    res.json({ 
      otpRequired: true,
      message: "Login OTP sent to your email. Please verify to continue." 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Verify login OTP and issue JWT.
 */
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    if (!user.loginOtp || user.loginOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (user.loginOtpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please login again." });
    }

    // Clear OTP fields
    user.loginOtp = undefined;
    user.loginOtpExpiry = undefined;
    await user.save();

    const token = generateToken(user._id, user.role);

    res.json({
      token,
      user: { id: user._id, name: user.name, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { name, email, googleId } = req.body;
    let user = await User.findOne({ email });
    
    if (!user) {
      user = new User({ name, email, googleId, isEmailVerified: true });
      await user.save();
    }

    if (user.isBlacklisted) return res.status(403).json({ message: "Your account has been suspended." });
    
    const token = generateToken(user._id, user.role);
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const pendingUser = await PendingUser.findOne({ email });
    
    if (!pendingUser) return res.status(400).json({ message: "No pending registration found or OTP expired" });
    if (pendingUser.otp !== otp || pendingUser.otpExpiry < Date.now()) return res.status(400).json({ message: "Invalid or expired OTP" });

    const user = new User({
      name: pendingUser.name,
      email: pendingUser.email,
      password: pendingUser.password,
      isEmailVerified: true
    });
    
    await user.save();
    await PendingUser.deleteOne({ email });

    res.json({ message: "Email successfully verified. You can now login, user created." });
  } catch(error) {
    res.status(500).json({ message: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No user with that email" });

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiry = Date.now() + 3600000;
    await user.save();

    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
    const message = `You requested a password reset.\n\nPlease go to this link to reset your password:\n${resetUrl}`;

    try {
      await sendEmail({ 
        email: user.email, 
        subject: "Password Reset Token - UniVerse", 
        message,
        resetUrl: resetUrl
      });
      res.json({ message: "Email sent" });
    } catch (error) {
      user.resetPasswordToken = null;
      user.resetPasswordExpiry = null;
      await user.save();
      return res.status(500).json({ message: "Email could not be sent: " + error.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
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
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp -resetPasswordToken -loginOtp -loginOtpExpiry");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, bio } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    
    if (req.file) {
      user.avatar = `/uploads/${req.file.filename}`; // Future Cloudinary transition point
    } else if (req.body.avatar) {
      user.avatar = req.body.avatar;
    }

    await user.save();
    
    res.json({ 
      message: "Profile updated successfully", 
      user: { id: user._id, name: user.name, role: user.role, bio: user.bio, avatar: user.avatar } 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
