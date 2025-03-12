const express = require("express");
const bodyParser = require("body-parser");
const codeRoutes = require("./routes/codeRoutes");

const app = express();

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

// Middleware
app.use(bodyParser.json());

// Routes
app.use("/api", codeRoutes);

module.exports = app;