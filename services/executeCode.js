const { exec } = require("child_process");
const fs = require("fs");
const path = require("path"); // Add this line

const executeCodeService = (code, language) => {
  console.log("code", code);
  console.log("language", language);
  
  return new Promise((resolve, reject) => {
    const tempDir = path.join(__dirname, "temp");
    const fileExt = { python: "py", cpp: "cpp", c: "c" };
    const dockerImages = {
      python: "python-sandbox",
      cpp: "cpp-sandbox",
      c: "c-sandbox",
    };

    if (!fileExt[language]) return reject("Unsupported language");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const codeFilePath = path.join(tempDir, `code.${fileExt[language]}`);
    fs.writeFile(codeFilePath, code, (error) => {
      if (error) return reject(error);

      const dockerVolumePath = tempDir.replace(/\\/g, "/");
      const command = `docker run --rm -v "${dockerVolumePath}:/app" ${dockerImages[language]}`;

      exec(command, (error, stdout, stderr) => {
        fs.unlinkSync(codeFilePath); // Delete the temp file
        if (error) return reject(stderr || error);
        resolve(stdout);
      });
    });
  });
};

module.exports = {
  executeCodeService,
};
