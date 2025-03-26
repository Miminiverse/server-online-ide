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

// Function to strip ANSI escape sequences
const stripAnsi = (str) => {
  return str.replace(
    /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    ""
  );
};

const getCrossCompatibleTempDir = () => {
  let tempDir;

  if (process.platform === "win32") {
    tempDir = path.join(os.tmpdir(), "code-execution-temp");
  } else if (process.platform === "darwin") {
    tempDir = path.join("/tmp", "code-execution-temp");
  } else {
    tempDir = path.join(os.tmpdir(), "code-execution-temp");
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true, mode: 0o777 });
  }

  return tempDir;
};

const formatDockerPath = (localPath) => {
  if (process.platform === "win32") {
    const driveLetter = localPath.charAt(0).toLowerCase();
    const pathWithoutDrive = localPath.substring(2).replace(/\\/g, "/");
    return `/${driveLetter}${pathWithoutDrive}`;
  } else {
    return localPath;
  }
};

const executeCodeService = (code, language, onData) => {
  if (language === "c++") {
    language = "cpp";
  }

  console.log("Language:", language);
  console.log("code:", code);

  return new Promise((resolve, reject) => {
    const tempDir = getCrossCompatibleTempDir();
    const fileExt = { python: "py", cpp: "cpp", javascript: "js" };

    if (!dockerImages[language]) {
      return reject("Unsupported language");
    }

    const codeFilePath = path.join(tempDir, `code.${fileExt[language]}`);

    fs.writeFile(codeFilePath, code, { mode: 0o777 }, (error) => {
      if (error) return reject(error);

      let dockerVolumePath = formatDockerPath(tempDir);

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
      const command = `docker run --rm -i -v "${dockerVolumePath}:/app" ${dockerImages[language]} sh -c "${runCommand}"`;

      let shell = process.platform === "win32" ? "cmd.exe" : "bash";

      const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-color",
        cols: 80,
        rows: 30,
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env,
      });

      ptyProcess.write(`${command}\r`);

      let lastOutput = '';

      ptyProcess.on("data", (data) => {
        lastOutput += data;
        console.log("Raw output:", data);

        // Remove ANSI escape sequences
        const cleanData = stripAnsi(data);

        // Clean up unwanted command-line output
        const filteredData = cleanData
          .replace(/Microsoft Windows \[Version .*\]\r\n/g, "")
          .replace(/\(c\) Microsoft Corporation\. All rights reserved\.\r\n/g, "")
          .replace(/C:\\Users\\.*>\s*/g, "")
          .replace(/docker run --rm -i -v ".*" code-runner-.*\r\n/g, "");

        if (filteredData.trim()) {
          console.log("Filtered output:", filteredData);
          if (onData) {
            onData(filteredData);
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