const docker = require("./docker-manager");

async function executeCode(language, code) {
  const imageMap = {
    python: "python-executor",
    javascript: "javascript-executor",
    cpp: "cpp-executor",
  };

  const container = await docker.createContainer({
    Image: imageMap[language],
    Cmd: getExecutionCommand(language),
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    OpenStdin: true,
  });

  await container.start();

  const exec = await container.exec({
    Cmd: getRuntimeCommand(language, code),
    AttachStdout: true,
    AttachStderr: true,
  });

  return new Promise((resolve) => {
    let output = "";
    exec.start({ hijack: true }, (err, stream) => {
      stream.on("data", (chunk) => (output += chunk.toString()));
      stream.on("end", () => {
        container.remove({ force: true }); // Cleanup
        resolve(output);
      });
    });
  });
}

function getRuntimeCommand(lang, code) {
  const commands = {
    python: ["python3", "-c", code],
    javascript: ["node", "-e", code],
    cpp: [
      "sh",
      "-c",
      `echo "${code}" > temp.cpp && g++ temp.cpp -o temp && ./temp`,
    ],
  };
  return commands[lang];
}

module.exports = { executeCode };
