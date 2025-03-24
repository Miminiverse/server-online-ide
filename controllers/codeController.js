const codeService = require("../services/executeCode");

const executeCode = async (req, res) => {
  const { code, language } = req.body;

  try {
    const output = await codeService.executeCodeService(code, language);
    console.log("output 2", output);
    
    res.json({ output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  executeCode,
};