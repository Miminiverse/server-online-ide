const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os"); // Add this for OS-specific handling

const executeCodeService = (code, language) => {
  console.log("code", code);
  console.log("language", language);

  return new Promise((resolve, reject) => {
    // Use a cross-platform temp directory
    const tempDir = path.join(os.tmpdir(), "code-execution-temp");
    const fileExt = { python: "py", cpp: "cpp", c: "c" };
    const dockerImages = {
      python: "python-sandbox",
      cpp: "cpp-sandbox",
      c: "c-sandbox",
    };

    if (!fileExt[language]) return reject("Unsupported language");

    // Ensure the temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const codeFilePath = path.join(tempDir, `code.${fileExt[language]}`);
    fs.writeFile(codeFilePath, code, (error) => {
      if (error) return reject(error);

      // Convert Windows paths to Unix-style for Docker
      const dockerVolumePath = tempDir.replace(/\\/g, "/");

      // Build the Docker command
      const command = `docker run --rm -v "${dockerVolumePath}:/app" ${dockerImages[language]}`;

      // Execute the Docker command
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