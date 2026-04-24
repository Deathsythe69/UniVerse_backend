const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    // 1️⃣ Get token from header
    const authHeader = req.header("Authorization");

    if (!authHeader) {
      return res.status(401).json({
        message: "Access denied. No token provided."
      });
    }

    // 2️⃣ Check correct Bearer format
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Invalid token format."
      });
    }

    // 3️⃣ Extract actual token
    const token = authHeader.split(" ")[1];

    // 4️⃣ Verify token using secret from .env
  const verified = jwt.verify(token, process.env.JWT_SECRET);

    // 5️⃣ Attach decoded user data to request
    req.user = verified;

    next(); // continue to next route

  } catch (error) {
    return res.status(401).json({
      message: "Token is not valid."
    });
  }
};

module.exports = authMiddleware;