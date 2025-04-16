const express = require("express");
const codeController = require("../controllers/codeController");

const router = express.Router();

// POST /api/execute

router.post("/execute", async (req, res) => {
  try {
    const { language, code } = req.body;
    const output = await codeController.executeCode(language, code);
    res.json({ success: true, output });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
