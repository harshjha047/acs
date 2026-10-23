const { Schema, model } = require("mongoose");

const TYPES = ["registered", "boot", "online", "offline", "wan_up", "wan_down", "ppp_reconnect", "ip_change", "firmware_change"];

const DeviceEventSchema = new Schema({
  device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
  type: { type: String, enum: TYPES, required: true },
  at: { type: Date, required: true },
  details: { type: Schema.Types.Mixed }
}, { versionKey: false });

DeviceEventSchema.index({ device: 1, at: -1 });
DeviceEventSchema.index({ type: 1, at: -1 });
DeviceEventSchema.index({ at: 1 }, { expireAfterSeconds: Number(process.env.EVENT_RETENTION_DAYS || 180) * 86400 });

module.exports = model("DeviceEvent", DeviceEventSchema);
module.exports.TYPES = TYPES;
