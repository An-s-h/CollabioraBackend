import { Router } from "express";
import { User } from "../models/User.js";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

// POST /api/auth/register - Register new user
router.post("/auth/register", async (req, res) => {
  const { username, email, password, role, medicalInterests } = req.body || {};
  
  if (!username || !email || !password || !["patient", "researcher"].includes(role)) {
    return res.status(400).json({ error: "username, email, password, and role are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email, role });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email and role already exists" });
    }

    // Create new user
    const user = await User.create({
      username,
      email,
      password, // Will be hashed by pre-save hook
      role,
      medicalInterests: medicalInterests || [],
    });

    // Generate JWT token
    const token = generateToken(user._id.toString());

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.json({ user: userResponse, token });
  } catch (error) {
    console.error("Registration error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email already exists for this role" });
    }
    return res.status(500).json({ error: "Failed to register user" });
  }
});

// POST /api/auth/login - Login with email and password
router.post("/auth/login", async (req, res) => {
  const { email, password, role } = req.body || {};
  
  if (!email || !password || !["patient", "researcher"].includes(role)) {
    return res.status(400).json({ error: "email, password, and role are required" });
  }

  try {
    // Find user by email and role
    const user = await User.findOne({ email, role });
    
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT token
    const token = generateToken(user._id.toString());

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.json({ user: userResponse, token });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Failed to login" });
  }
});

// POST /api/auth/update-profile - Update user profile with medical interests/conditions
router.post("/auth/update-profile", async (req, res) => {
  const { userId, medicalInterests } = req.body || {};
  
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { medicalInterests: medicalInterests || [] },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.json({ user: userResponse });
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// PUT /api/auth/update-user - Update user information (username)
router.put("/auth/update-user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { username } = req.body || {};
  
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const updateData = {};
    if (username) {
      updateData.username = username;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.json({ user: userResponse });
  } catch (error) {
    console.error("User update error:", error);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

// Legacy endpoints for backward compatibility (can be removed later)
// POST /api/session - Legacy endpoint, redirects to register
router.post("/session", async (req, res) => {
  const { username, role, email } = req.body || {};
  if (!username || !["patient", "researcher"].includes(role)) {
    return res.status(400).json({ error: "username and role required" });
  }
  return res.status(400).json({ error: "Please use /api/auth/register with email and password" });
});

// POST /api/session/signin - Legacy endpoint, redirects to login
router.post("/session/signin", async (req, res) => {
  return res.status(400).json({ error: "Please use /api/auth/login with email and password" });
});

export default router;


