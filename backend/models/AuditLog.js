const { Schema, model } = require("mongoose");

const AuditLogSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
  action: {
    type: String,
    enum: ["diagnostics_view", "reboot", "factory_reset", "wifi_update", "firmware_push", "auto_provision", "refresh", "ping", "speed_test", "upload_test", "traceroute", "capture", "customer_link", "device_remove"],
    required: true
  },
  details: { type: Schema.Types.Mixed },
  result: { type: String, enum: ["success", "failed", "pending"], default: "pending" },
  errorMessage: { type: String },
  timestamp: { type: Date, default: Date.now }
});

AuditLogSchema.index({ device: 1, timestamp: -1 });

module.exports = model("AuditLog", AuditLogSchema);
