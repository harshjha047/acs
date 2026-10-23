const { Schema, model } = require("mongoose");

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["agent", "noc", "admin"], default: "agent" },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  tokenVersion: { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockedUntil: { type: Date },
  mfa: {
    secret: { type: String, select: false },
    pending: { type: String, select: false },
    lastStep: { type: Number, select: false },
    enabledAt: { type: Date }
  }
}, { timestamps: true });

module.exports = model("User", UserSchema);
