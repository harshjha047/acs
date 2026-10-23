const { Schema, model } = require("mongoose");

const AlertSchema = new Schema({
  device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
  type: { type: String, enum: ["offline", "low_rx", "reboot_loop", "unknown_device"], required: true },
  severity: { type: String, enum: ["info", "warn", "critical"], default: "warn" },
  message: { type: String },
  value: { type: Schema.Types.Mixed },
  open: { type: Boolean, default: true },
  openedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  ackBy: { type: Schema.Types.ObjectId, ref: "User" },
  ackAt: { type: Date },
  ackNote: { type: String }
}, { versionKey: false });

AlertSchema.index({ device: 1, type: 1 }, { unique: true, partialFilterExpression: { open: true } });
AlertSchema.index({ open: 1, severity: 1, openedAt: -1 });
AlertSchema.index({ closedAt: 1 }, { expireAfterSeconds: 90 * 86400 });

module.exports = model("Alert", AlertSchema);
