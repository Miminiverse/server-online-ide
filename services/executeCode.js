const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const dockerImages = {
  python: "code-runner-python",
  cpp: "code-runner-cpp",
  javascript: "code-runner-js",
};

const executeCodeService = (code, language) => {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(os.tmpdir(), "code-execution-temp");
    const fileExt = { python: "py", cpp: "cpp", javascript: "js" };

    if (!dockerImages[language]) return reject("Unsupported language");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const codeFilePath = path.join(tempDir, `code.${fileExt[language]}`);
    fs.writeFile(codeFilePath, code, (error) => {
      if (error) return reject(error);

      const dockerVolumePath = tempDir.replace(/\\/g, "/");
      const command = `docker run --rm -v "${dockerVolumePath}:/app" ${dockerImages[language]}`;

      exec(command, (error, stdout, stderr) => {
        fs.unlinkSync(codeFilePath); // Cleanup after execution
        if (error) return reject(stderr || error);
        resolve(stdout);
      });
    });
  });
};

module.exports = {
  executeCodeService,
};
