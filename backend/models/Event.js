const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ["seminar", "workshop", "placement", "internship", "other"], default: "other" },
  date: { type: Date, required: true },
  location: { type: String, required: true },
  organizer: { type: String },
  image: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("Event", eventSchema);
