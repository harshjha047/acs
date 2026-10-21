const { Schema, model } = require("mongoose");

const DeviceNoteSchema = new Schema({
  device: { type: Schema.Types.ObjectId, ref: "Device", required: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, maxlength: 2000 }
}, { timestamps: true });

module.exports = model("DeviceNote", DeviceNoteSchema);
