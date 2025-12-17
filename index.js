import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { connectMongo } from "./config/mongo.js";
import sessionRoutes from "./routes/session.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import searchRoutes from "./routes/search.routes.js";
import recommendationsRoutes from "./routes/recommendations.routes.js";
import favoritesRoutes from "./routes/favorites.routes.js";
import forumsRoutes from "./routes/forums.routes.js";
import { ForumCategory } from "./models/ForumCategory.js";
import trialsRoutes from "./routes/trials.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import insightsRoutes from "./routes/insights.routes.js";
import followRoutes from "./routes/follow.routes.js";
import messagesRoutes from "./routes/messages.routes.js";
import meetingRequestsRoutes from "./routes/meeting-requests.routes.js";
import connectionRequestsRoutes from "./routes/connection-requests.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { optionalSession } from "./middleware/auth.js";
import { searchLimitMiddleware } from "./middleware/searchLimit.js";

dotenv.config();

const app = express();

// Trust proxy - Required for Vercel to correctly detect HTTPS and get real client IP
// Vercel uses a reverse proxy, so we need to trust the X-Forwarded-* headers
app.set("trust proxy", 1);

// CORS configuration optimized for cross-origin cookies on Vercel
app.use(
  cors({
    origin: true, // Allow all origins (you can restrict this in production)
    credentials: true, // CRITICAL: Must be true for cookies to work cross-origin
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Cookie",
    ],
    exposedHeaders: ["Set-Cookie"], // Expose Set-Cookie header
    optionsSuccessStatus: 200,
  })
);

// Middleware to ensure proper headers for cookie handling
app.use((req, res, next) => {
  // Ensure Access-Control-Allow-Credentials is set
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(cookieParser());
app.use(express.json());

// Health
app.get("/", (_req, res) => {
  res.send("CuraLink backend is running 🚀");
});

// Apply optional session middleware globally (for routes that need it)
// Apply search limit middleware globally (sets device token cookie for anonymous users)
app.use(optionalSession);
app.use(searchLimitMiddleware);

// TODO: mount routes here (session, profile, search, recommendations, favorites, forums, trials, ai)
app.use("/api", sessionRoutes);
app.use("/api", profileRoutes);
app.use("/api", searchRoutes);
app.use("/api", recommendationsRoutes);
app.use("/api", favoritesRoutes);
app.use("/api", forumsRoutes);
app.use("/api", trialsRoutes);
app.use("/api", aiRoutes);
app.use("/api", insightsRoutes);
app.use("/api", followRoutes);
app.use("/api", messagesRoutes);
app.use("/api", meetingRequestsRoutes);
app.use("/api", connectionRequestsRoutes);
app.use("/api", adminRoutes);

const PORT = process.env.PORT || 5000;

await connectMongo();

async function start() {
  await connectMongo();
  // Seed forum categories
  const defaults = [
    { slug: "lung-cancer", name: "Lung Cancer" },
    { slug: "heart-related", name: "Heart Related" },
    { slug: "cancer-research", name: "Cancer Research" },
    { slug: "neurology", name: "Neurology" },
    { slug: "oncology", name: "Oncology" },
    { slug: "cardiology", name: "Cardiology" },
    { slug: "clinical-trials", name: "Clinical Trials" },
    { slug: "general-health", name: "General Health" },
  ];
  for (const c of defaults) {
    // upsert by slug
    await ForumCategory.updateOne(
      { slug: c.slug },
      { $setOnInsert: c },
      { upsert: true }
    );
  }
}

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
