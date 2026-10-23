const { Schema, model } = require("mongoose");

const days = Number(process.env.TELEMETRY_RETENTION_DAYS || 30);

const TelemetrySchema = new Schema({
  at: { type: Date, required: true },
  device: { type: Schema.Types.ObjectId, ref: "Device", required: true },
  rx: Number,
  tx: Number,
  temp: Number,
  fec: Number,
  uptime: Number,
  pppUptime: Number,
  wanUp: Boolean,
  bytesIn: Number,
  bytesOut: Number
}, {
  versionKey: false,
  timeseries: { timeField: "at", metaField: "device", granularity: "minutes" },
  expireAfterSeconds: days * 86400
});

TelemetrySchema.index({ device: 1, at: -1 });

module.exports = model("Telemetry", TelemetrySchema, "telemetry");
