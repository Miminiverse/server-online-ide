const http = require("http");
const app = require("./app");
const { setupWebSocketServer } = require("./services/websocketHandler");
const { LOCAL_PORT } = require("./constants/string");

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server using the same HTTP server
const wss = setupWebSocketServer(server);

// Start the server
const PORT = process.env.PORT || LOCAL_PORT;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
