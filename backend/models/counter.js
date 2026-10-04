const mongoose = require("mongoose");

// Running numbers, e.g. { _id: "himalayan:bill:2082/83", seq: 125 }
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);