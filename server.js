const http = require("http");
const app = require("./app");
const { setupWebSocketServer } = require("./services/websocketHandler");

// Create HTTP server
const server = http.createServer(app);

// Set up WebSocket server using the same HTTP server
const wss = setupWebSocketServer(server);

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});