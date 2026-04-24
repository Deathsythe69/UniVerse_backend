const mongoose = require("mongoose");

const pendingUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  otp: { type: String, required: true },
  otpExpiry: { type: Date, required: true }
}, { timestamps: true });

// Auto-delete document after 15 minutes (900 seconds)
pendingUserSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

module.exports = mongoose.model("PendingUser", pendingUserSchema);
