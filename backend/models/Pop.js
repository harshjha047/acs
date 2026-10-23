const { Schema, model } = require("mongoose");

const PopSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  location: { type: String, trim: true },
  notes: { type: String }
}, { timestamps: true });

module.exports = model("Pop", PopSchema);
