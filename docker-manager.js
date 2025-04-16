const Docker = require("dockerode");
const docker = new Docker({
  socketPath: "/var/run/docker.sock", // Default Docker socket
  // OR for remote Docker:
  // host: 'http://192.168.1.100',
  // port: 2375
});

module.exports = docker;
