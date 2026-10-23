const { Schema, model } = require("mongoose");

const PonPortSchema = new Schema({
  olt: { type: Schema.Types.ObjectId, ref: "Olt", required: true },
  slot: { type: String, default: "" },
  port: { type: String, required: true },
  label: { type: String, trim: true },
  capacity: { type: Number }
}, { timestamps: true });

PonPortSchema.index({ olt: 1, slot: 1, port: 1 }, { unique: true });

module.exports = model("PonPort", PonPortSchema);
