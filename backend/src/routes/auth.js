const express = require("express");
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/google", authController.googleLogin);
router.post("/verify-otp", authController.verifyOtp);
router.post("/verify-login-otp", authController.verifyLoginOtp);
router.post("/forgot-password", authController.forgotPassword);
router.put("/reset-password/:token", authController.resetPassword);

router.get("/profile", authMiddleware, authController.getProfile);
router.put("/profile", authMiddleware, upload.single("avatar"), authController.updateProfile);

module.exports = router;