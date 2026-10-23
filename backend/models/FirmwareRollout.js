const { Schema, model } = require("mongoose");

const FirmwareRolloutSchema = new Schema({
  release: { type: Schema.Types.ObjectId, ref: "FirmwareRelease", required: true },
  target: {
    tags: [{ type: String }],
    fromVersions: [{ type: String }]
  },
  waves: { type: [Number], default: [5, 50, 500, 0] },
  currentWave: { type: Number, default: 0 },
  maxFailPct: { type: Number, default: 5 },
  window: { start: { type: String, default: "01:00" }, end: { type: String, default: "05:00" } },
  status: { type: String, enum: ["draft", "running", "paused", "halted", "done"], default: "draft", index: true },
  note: { type: String },
  reason: { type: String, required: true },
  history: [{ _id: false, op: String, by: { type: Schema.Types.ObjectId, ref: "User" }, at: Date, note: String }],
  startedAt: { type: Date },
  finishedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

module.exports = model("FirmwareRollout", FirmwareRolloutSchema);
