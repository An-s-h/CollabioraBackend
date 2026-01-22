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
import readItemsRoutes from "./routes/readItems.routes.js";
import forumsRoutes from "./routes/forums.routes.js";
import postsRoutes from "./routes/posts.routes.js";
import communitiesRoutes from "./routes/communities.routes.js";
import trialsRoutes from "./routes/trials.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import insightsRoutes from "./routes/insights.routes.js";
import followRoutes from "./routes/follow.routes.js";
import messagesRoutes from "./routes/messages.routes.js";
import meetingRequestsRoutes from "./routes/meeting-requests.routes.js";
import connectionRequestsRoutes from "./routes/connection-requests.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import waitlistRoutes from "./routes/waitlist.routes.js";
import hubspotDebugRoutes from "./routes/hubspot-debug.routes.js";
import { optionalSession } from "./middleware/auth.js";
import { searchLimitMiddleware } from "./middleware/searchLimit.js";

dotenv.config();

const app = express();
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow Postman / server-to-server

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

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
app.use("/api", readItemsRoutes);
app.use("/api", forumsRoutes);
app.use("/api", postsRoutes);
app.use("/api", communitiesRoutes);
app.use("/api", trialsRoutes);
app.use("/api", aiRoutes);
app.use("/api", insightsRoutes);
app.use("/api", followRoutes);
app.use("/api", messagesRoutes);
app.use("/api", meetingRequestsRoutes);
app.use("/api", connectionRequestsRoutes);
app.use("/api", adminRoutes);
app.use("/api", waitlistRoutes);
app.use("/api", hubspotDebugRoutes); // Debug route - remove in production

// Connect to MongoDB (connection will be reused across serverless invocations)
connectMongo().catch((err) => {
  console.error("Failed to connect to MongoDB", err);
});

// Export the app for Vercel serverless functions
export default app;
