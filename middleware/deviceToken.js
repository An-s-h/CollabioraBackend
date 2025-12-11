import crypto from "crypto";
import { DeviceToken } from "../models/DeviceToken.js";

const DEVICE_TOKEN_COOKIE_NAME = "device_token";
const MAX_FREE_SEARCHES = 6;

/**
 * Middleware to get or create a device token for anonymous users
 * Sets the token in a HttpOnly cookie and attaches it to req.deviceToken
 */
export async function getOrCreateDeviceToken(req, res, next) {
  try {
    // Check if user is authenticated - authenticated users don't need device tokens
    if (req.user) {
      req.deviceToken = null;
      return next();
    }

    // Try to get token from cookie
    let token = req.cookies?.[DEVICE_TOKEN_COOKIE_NAME];

    // Debug logging for incognito mode issues
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DeviceToken] Cookie received: ${token ? "YES" : "NO"}`);
    }

    // If no token in cookie, generate a new one
    if (!token) {
      token = crypto.randomUUID();

      // Create device token record in database
      await DeviceToken.create({
        token,
        searchCount: 0,
      });

      // Set HttpOnly cookie (expires in 1 year)
      // Use sameSite: "lax" for better incognito mode compatibility
      // For incognito mode: secure must be false on HTTP (localhost), true only on HTTPS
      const isProduction = process.env.NODE_ENV === "production";
      const isHTTPS = req.secure || req.headers["x-forwarded-proto"] === "https";
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction && isHTTPS, // Only secure on HTTPS in production
        sameSite: "lax", // Works better in incognito mode than "strict" or "none"
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        path: "/",
      };
      res.cookie(DEVICE_TOKEN_COOKIE_NAME, token, cookieOptions);

      // Debug logging
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[DeviceToken] Created new token: ${token.substring(0, 8)}...`
        );
      }
    } else {
      // Verify token exists in database
      const deviceTokenRecord = await DeviceToken.findOne({ token });

      if (!deviceTokenRecord) {
        // Token in cookie but not in DB - create new one
        token = crypto.randomUUID();
        await DeviceToken.create({
          token,
          searchCount: 0,
        });

        // Use same cookie options as above
        const isProduction = process.env.NODE_ENV === "production";
        const isHTTPS = req.secure || req.headers["x-forwarded-proto"] === "https";
        res.cookie(DEVICE_TOKEN_COOKIE_NAME, token, {
          httpOnly: true,
          secure: isProduction && isHTTPS, // Only secure on HTTPS in production
          sameSite: "lax", // Works better in incognito mode
          maxAge: 365 * 24 * 60 * 60 * 1000,
          path: "/",
        });
      }
    }

    req.deviceToken = token;
    next();
  } catch (error) {
    console.error("Error in getOrCreateDeviceToken middleware:", error);
    // Continue without device token if there's an error
    req.deviceToken = null;
    next();
  }
}

/**
 * Check if anonymous user can perform a search
 * Returns { canSearch: boolean, remaining: number }
 */
export async function checkSearchLimit(deviceToken) {
  if (!deviceToken) {
    return { canSearch: false, remaining: 0 };
  }

  try {
    const deviceTokenRecord = await DeviceToken.findOne({ token: deviceToken });

    if (!deviceTokenRecord) {
      return { canSearch: false, remaining: 0 };
    }

    const remaining = Math.max(
      0,
      MAX_FREE_SEARCHES - deviceTokenRecord.searchCount
    );
    const canSearch = remaining > 0;

    return { canSearch, remaining };
  } catch (error) {
    console.error("Error checking search limit:", error);
    return { canSearch: false, remaining: 0 };
  }
}

/**
 * Increment search count for a device token
 */
export async function incrementSearchCount(deviceToken) {
  if (!deviceToken) {
    return;
  }

  try {
    await DeviceToken.findOneAndUpdate(
      { token: deviceToken },
      {
        $inc: { searchCount: 1 },
        $set: { lastSearchAt: new Date() },
      }
    );
  } catch (error) {
    console.error("Error incrementing search count:", error);
  }
}
