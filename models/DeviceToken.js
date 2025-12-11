import mongoose from "mongoose";

const deviceTokenSchema = new mongoose.Schema(
  {
    token: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true 
    },
    searchCount: { 
      type: Number, 
      default: 0 
    },
    lastSearchAt: { 
      type: Date 
    },
  },
  { 
    timestamps: true 
  }
);

// Index for efficient lookups
deviceTokenSchema.index({ token: 1 });
deviceTokenSchema.index({ createdAt: 1 });

export const DeviceToken = mongoose.models.DeviceToken || mongoose.model("DeviceToken", deviceTokenSchema);

