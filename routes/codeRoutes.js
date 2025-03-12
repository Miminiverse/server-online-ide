const express = require("express");
const codeController = require("../controllers/codeController");

const router = express.Router();

// POST /api/execute
router.post("/execute", codeController.executeCode);

module.exports = router;