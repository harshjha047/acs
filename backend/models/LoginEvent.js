const { Schema, model } = require("mongoose");

const LoginEventSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  email: { type: String },
  ip: { type: String },
  ua: { type: String },
  ok: { type: Boolean, required: true },
  reason: { type: String, enum: ["ok", "mfa_ok", "mfa_pending", "unknown_user", "bad_password", "disabled", "locked", "bad_mfa", "mfa_enabled", "mfa_disabled", "mfa_reset", "password_changed", "logout_all", "revoked", "unlocked"], required: true },
  at: { type: Date, default: Date.now, expires: 180 * 24 * 3600 }
});

LoginEventSchema.index({ user: 1, at: -1 });

module.exports = model("LoginEvent", LoginEventSchema);
