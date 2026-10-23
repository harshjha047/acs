const { Schema, model } = require("mongoose");

const TYPES = ["offline", "low_rx", "reboot_loop", "unknown_device", "optical_degrading", "high_temp", "high_fec",
  "wan_flapping", "ppp_flapping", "lan_100m", "pon_outage", "firmware_changed"];

const AlertSchema = new Schema({
  device: { type: Schema.Types.ObjectId, ref: "Device", required() { return this.type !== "pon_outage"; } },
  ponPort: { type: Schema.Types.ObjectId, ref: "PonPort" },
  type: { type: String, enum: TYPES, required: true },
  severity: { type: String, enum: ["info", "warn", "critical"], default: "warn" },
  message: { type: String },
  value: { type: Schema.Types.Mixed },
  open: { type: Boolean, default: true },
  openedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  ackBy: { type: Schema.Types.ObjectId, ref: "User" },
  ackAt: { type: Date },
  ackNote: { type: String },
  affected: { type: Number },
  cause: { code: String, confidence: Number, evidence: [String] }
}, { versionKey: false });

AlertSchema.index({ device: 1, type: 1 }, { name: "open_device_type", unique: true, partialFilterExpression: { open: true, device: { $exists: true } } });
AlertSchema.index({ ponPort: 1, type: 1 }, { name: "open_pon_type", unique: true, partialFilterExpression: { open: true, ponPort: { $exists: true } } });
AlertSchema.index({ open: 1, severity: 1, openedAt: -1 });
AlertSchema.index({ closedAt: 1 }, { expireAfterSeconds: 90 * 86400 });

module.exports = model("Alert", AlertSchema);
module.exports.TYPES = TYPES;
