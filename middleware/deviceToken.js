import crypto from "crypto";
import { DeviceToken } from "../models/DeviceToken.js";
import { IPLimit } from "../models/IPLimit.js";

const DEVICE_TOKEN_COOKIE_NAME = "device_token";
const MAX_FREE_SEARCHES = 6;

/**
 * Extract client IP address from request
 * Handles proxies and load balancers by checking X-Forwarded-For header
 */
export function getClientIP(req) {
  // Check for forwarded IP (from proxy/load balancer)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[0];
  }

  // Check for real IP header (some proxies use this)
  if (req.headers["x-real-ip"]) {
    return req.headers["x-real-ip"];
  }

  // Fallback to connection remote address
  return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || null;
}

/**
 * Hash IP address for privacy
 * Uses SHA-256 with a salt for additional security
 */
function hashIP(ip) {
  if (!ip) {
    return null;
  }

  // Use a salt from environment variable or default (should be set in production)
  const salt = process.env.IP_HASH_SALT || "default-salt-change-in-production";
  
  // Create hash using SHA-256
  const hash = crypto.createHash("sha256");
  hash.update(ip + salt);
  return hash.digest("hex");
}

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
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // HTTPS only in production
        sameSite: "lax", // Works better in incognito mode than "strict"
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

        res.cookie(DEVICE_TOKEN_COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
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
 * Check IP-based search limit
 * Returns { canSearch: boolean, remaining: number }
 */
export async function checkIPSearchLimit(req) {
  const clientIP = getClientIP(req);
  if (!clientIP) {
    // If we can't get IP, allow the request (fail open)
    return { canSearch: true, remaining: MAX_FREE_SEARCHES };
  }

  try {
    const hashedIP = hashIP(clientIP);
    if (!hashedIP) {
      return { canSearch: true, remaining: MAX_FREE_SEARCHES };
    }

    const ipLimitRecord = await IPLimit.findOne({ hashedIP });

    if (!ipLimitRecord) {
      // No record means no searches yet - allow
      return { canSearch: true, remaining: MAX_FREE_SEARCHES };
    }

    const remaining = Math.max(
      0,
      MAX_FREE_SEARCHES - ipLimitRecord.searchCount
    );
    const canSearch = remaining > 0;

    return { canSearch, remaining };
  } catch (error) {
    console.error("Error checking IP search limit:", error);
    // Fail open - allow request if there's an error
    return { canSearch: true, remaining: MAX_FREE_SEARCHES };
  }
}

/**
 * Increment IP-based search count
 */
export async function incrementIPSearchCount(req) {
  const clientIP = getClientIP(req);
  if (!clientIP) {
    return;
  }

  try {
    const hashedIP = hashIP(clientIP);
    if (!hashedIP) {
      return;
    }

    await IPLimit.findOneAndUpdate(
      { hashedIP },
      {
        $inc: { searchCount: 1 },
        $set: { lastSearchAt: new Date() },
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error("Error incrementing IP search count:", error);
  }
}

/**
 * Check if anonymous user can perform a search
 * Checks both device token and IP limits
 * Returns { canSearch: boolean, remaining: number }
 */
export async function checkSearchLimit(deviceToken, req = null) {
  // Check device token limit first
  let deviceTokenResult = { canSearch: false, remaining: 0 };
  
  if (deviceToken) {
    try {
      const deviceTokenRecord = await DeviceToken.findOne({ token: deviceToken });

      if (deviceTokenRecord) {
        const remaining = Math.max(
          0,
          MAX_FREE_SEARCHES - deviceTokenRecord.searchCount
        );
        deviceTokenResult = {
          canSearch: remaining > 0,
          remaining,
        };
      }
    } catch (error) {
      console.error("Error checking device token search limit:", error);
    }
  }

  // Check IP limit if request is provided
  let ipResult = { canSearch: true, remaining: MAX_FREE_SEARCHES };
  if (req) {
    ipResult = await checkIPSearchLimit(req);
  }

  // User can search only if BOTH limits allow it
  // Take the minimum remaining count
  const canSearch = deviceTokenResult.canSearch && ipResult.canSearch;
  const remaining = Math.min(deviceTokenResult.remaining, ipResult.remaining);

  return { canSearch, remaining };
}

/**
 * Increment search count for a device token and IP address
 */
export async function incrementSearchCount(deviceToken, req = null) {
  // Increment device token count
  if (deviceToken) {
    try {
      await DeviceToken.findOneAndUpdate(
        { token: deviceToken },
        {
          $inc: { searchCount: 1 },
          $set: { lastSearchAt: new Date() },
        }
      );
    } catch (error) {
      console.error("Error incrementing device token search count:", error);
    }
  }

  // Increment IP count if request is provided
  if (req) {
    await incrementIPSearchCount(req);
  }
}
