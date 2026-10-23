const { Schema, model } = require("mongoose");

const OltSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  pop: { type: Schema.Types.ObjectId, ref: "Pop" },
  vendor: { type: String, trim: true },
  model: { type: String, trim: true },
  mgmtIp: { type: String, trim: true },
  ponType: { type: String, enum: ["EPON", "GPON", "XGS"] }
}, { timestamps: true });

module.exports = model("Olt", OltSchema);
