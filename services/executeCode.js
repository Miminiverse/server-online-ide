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
      console.log("Python code written to file:", fs.readFileSync(codeFilePath, 'utf8'));
      if (error) return reject(error);
      let dockerVolumePath;

      if (process.platform === "win32") {
        dockerVolumePath = formatDockerPath(tempDir);
      } else if (process.platform === "darwin") {
        dockerVolumePath = tempDir;
      } else {
        dockerVolumePath = tempDir;
      }
      let command;
      if (process.platform === "win32") {
        command = `docker run --rm -i -v "${dockerVolumePath}:/app" ${dockerImages[language]}`;
      } else {
        command = `docker run --rm -i -v "${dockerVolumePath}:/app" ${dockerImages[language]}`;
      }

      let shell;
      if (process.platform === "win32") {
        shell = "cmd.exe";
      } else {
        shell = "bash";
      }

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
        // Accumulate output
        lastOutput += data;
        
        // Console logs for debugging
        console.log("Raw output:", data);
        
        // Remove ANSI escape sequences
        const cleanData = stripAnsi(data);
        
        // Filter out unwanted text
        const filteredData = cleanData
          .replace(/Microsoft Windows \[Version .*\]\r\n/g, "")
          .replace(/\(c\) Microsoft Corporation\. All rights reserved\.\r\n/g, "")
          .replace(/C:\\Users\\.*>\s*/g, "")
          .replace(/docker run --rm -i -v ".*" code-runner-python\r\n/g, "");
        
        if (filteredData.trim()) {
          console.log("Filtered output:", filteredData);
          if (onData) {
            onData(filteredData);
          }
          
          // Check if we've just sent input and now have new output
          if (lastOutput.includes("Hello,") && !lastOutput.includes("Enter your name:")) {
            console.log("Found greeting in output:", lastOutput);
            onData(lastOutput.split("Hello,")[1].trim());
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