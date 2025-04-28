const fs = require("fs");
const path = require("path");
const os = require("os");
const pty = require("node-pty");

const dockerImages = {
  python: "python-executor",
  cpp: "cpp-executor",
  javascript: "javascript-executor",
};

// Function to strip ANSI escape sequences
const stripAnsi = (str) => {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
};

const getTempDir = () => {
  const tempDir = path.join("/tmp", "code-execution-temp");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true, mode: 0o777 });
  }

  return tempDir;
};

const executeCodeService = (code, language, onData) => {
  if (language === "c++") {
    language = "cpp";
  }

  console.log("Language:", language);
  console.log("code:", code);

  return new Promise((resolve, reject) => {
    const tempDir = getTempDir();
    const fileExt = { python: "py", cpp: "cpp", javascript: "js" };

    if (!dockerImages[language]) {
      return reject("Unsupported language");
    }

    const codeFilePath = path.join(tempDir, `code.${fileExt[language]}`);

    fs.writeFile(codeFilePath, code, { mode: 0o777 }, (error) => {
      if (error) return reject(error);

      // Determine execution command based on language
      let runCommand;
      if (language === "python") {
        runCommand = `python /app/code.py`;
      } else if (language === "cpp") {
        runCommand = `g++ /app/code.cpp -o /app/code && /app/code`;
      } else if (language === "javascript") {
        runCommand = `node /app/code.js`;
      }

      // Build the full Docker command
      const command = `docker run --rm -i -v "${tempDir}:/app" ${dockerImages[language]} sh -c "${runCommand}"`;

      const ptyProcess = pty.spawn("bash", [], {
        name: "xterm-color",
        cols: 80,
        rows: 30,
        cwd: os.homedir(),
        env: process.env,
      });

      ptyProcess.write(`${command}\r`);

      let lastOutput = "";

      ptyProcess.on("data", (data) => {
        lastOutput += data;
        // Remove ANSI escape sequences
        const cleanData = stripAnsi(data);

        if (cleanData.trim()) {
          console.log("Filtered output:", cleanData);
          if (onData) {
            onData(cleanData);
          }
        }
      });

      ptyProcess.on("exit", (exitCode) => {
        console.log(`Process exited with code ${exitCode}`);
        if (exitCode !== 0) {
          console.error("Process failed with exit code", exitCode);
        }
      });

      resolve({ ptyProcess });
    });
  });
};

module.exports = {
  executeCodeService,
};
