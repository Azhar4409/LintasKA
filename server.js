const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(cors());
app.use(express.static("public"));

app.get("/api/gapeka", (req, res) => {
  const data = fs.readFileSync(path.join(__dirname, "public", "data", "gapeka.json"));
  res.json(JSON.parse(data));
});

app.get("/api/stations", (req, res) => {
  const data = fs.readFileSync(path.join(__dirname, "public", "data", "stations.json"));
  res.json(JSON.parse(data));
});

app.get("/api/routes", (req, res) => {
  const data = fs.readFileSync(path.join(__dirname, "public", "data", "route-path.json"));
  res.json(JSON.parse(data));
});

app.listen(3000, () => {
  console.log("Lintaska jalan di http://localhost:3000");
});
