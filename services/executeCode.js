const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const pty = require("node-pty");

const dockerImages = {
  python: "code-runner-python",
  cpp: "code-runner-cpp",
  javascript: "code-runner-js",
};

const executeCodeService = (code, language, onData) => {
  if (language === "c++") {
    language = "cpp";
  }
  console.log("Language:", language);

  return new Promise((resolve, reject) => {
    const tempDir = path.join(os.tmpdir(), "code-execution-temp");
    const fileExt = { python: "py", cpp: "cpp", javascript: "js" };

    if (!dockerImages[language]) {
      return reject("Unsupported language");
    }

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const codeFilePath = path.join(tempDir, `code.${fileExt[language]}`);
    fs.writeFile(codeFilePath, code, (error) => {
      if (error) return reject(error);

      const dockerVolumePath = tempDir.replace(/\\/g, "/");
      // Note the interactive flag (-i) for Docker.
      const command = `docker run --rm -i -v "${dockerVolumePath}:/app" ${dockerImages[language]}`;

      // Spawn a pseudo-terminal process for interactive execution.
      const ptyProcess = pty.spawn(command, [], {
        name: "xterm-color",
        cols: 80,
        rows: 30,
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env,
      });

      ptyProcess.on("data", (data) => {
        console.log("Output:", data); // Log all output
        if (onData) {
          onData(data);
        }
      });

      ptyProcess.on("exit", (exitCode) => {
        console.log(`Process exited with code ${exitCode}`);
        if (exitCode !== 0) {
          console.error("Process failed with exit code", exitCode);
        }
        fs.unlinkSync(codeFilePath);
      });

      // Resolve immediately with the pty process so that the caller can write input.
      resolve({ ptyProcess });
    });
  });
};

module.exports = {
  executeCodeService,
};
