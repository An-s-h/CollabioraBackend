import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["patient", "researcher"], required: true },
    medicalInterests: [{ type: String }], // Conditions for patients, interests for researchers
  },
  { timestamps: true }
);

// Compound index for email + role (same email can be patient AND researcher)
userSchema.index({ email: 1, role: 1 }, { unique: true });

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.models.User || mongoose.model("User", userSchema);
