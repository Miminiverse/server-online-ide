const WebSocket = require("ws");
const axios = require("axios");
const { performance } = require("perf_hooks");
const { BASE_END_POINT } = require("../constants/endpoints");
// Interactive C++ code that requires user input
const interactiveCppCode = `#include <iostream>
#include <string>

int main() {
    std::string name;
    int age;
    
    std::cout << "Enter your name: ";
    std::getline(std::cin, name);
    
    std::cout << "Enter your age: ";
    std::cin >> age;
    
    std::cout << "Hello, " << name << "! You are " << age << " years old." << std::endl;
    
    return 0;
}`;

// Configuration
const config = {
  httpUrl: BASE_END_POINT, // Your HTTP API endpoint
  wsUrl: "ws://localhost:8010", // Your WebSocket endpoint
  concurrentUsers: 1,
  requestsPerUser: 1,
  delayBetweenRequestsMs: 1000,
  simulatedInputs: [
    { input: "John Doe\n", delayMs: 500 },
    { input: "30\n", delayMs: 500 },
  ],
};

// Metrics collection
const metrics = {
  sessionsStarted: 0,
  sessionsCompleted: 0,
  sessionsWithErrors: 0,
  totalResponseTime: 0,
  errors: [],
  startTime: 0,
  endTime: 0,
  outputResponses: [], // Store terminal outputs
};

// Start a code execution session via HTTP and get session ID
async function startCodeExecution() {
  try {
    const response = await axios.post(`${config.httpUrl}/execute`, {
      code: interactiveCppCode,
      language: "cpp",
      interactive: true, // Flag to indicate this is an interactive session
    });

    return {
      success: true,
      sessionId: response.data.sessionId, // Assuming your API returns a session ID
      message: "Session started successfully",
    };
  } catch (error) {
    metrics.errors.push({
      phase: "session-start",
      message: error.message,
      code: error.response?.status || "NETWORK_ERROR",
      time: new Date().toISOString(),
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

function waitForOpenSocket(ws, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkSocket = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        clearInterval(checkSocket);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkSocket);
        reject(new Error("WebSocket connection timed out"));
      }
    }, 100);
  });
}

function waitForOpenSocket(ws, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkSocket = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        clearInterval(checkSocket);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkSocket);
        reject(new Error("WebSocket connection timed out"));
      }
    }, 100);
  });
}

// Simulate a user interacting with the terminal via WebSocket
async function simulateInteractiveSession(userId, requestId) {
  console.log(
    `User ${userId}, Request ${requestId}: Starting interactive session...`
  );

  // Start the code execution and get a session ID
  const startResult = await startCodeExecution();

  if (!startResult.success) {
    console.log(
      `User ${userId}, Request ${requestId}: Failed to start session - ${startResult.error}`
    );
    metrics.sessionsWithErrors++;
    return;
  }

  metrics.sessionsStarted++;
  const sessionId = startResult.sessionId;
  console.log(
    `User ${userId}, Request ${requestId}: Session started with ID ${sessionId}`
  );

  return new Promise((resolve) => {
    let outputBuffer = "";
    let inputIndex = 0;
    let wsConnected = false;
    let inputTimeout = null;

    // Connect to WebSocket terminal
    const ws = new WebSocket(`${config.wsUrl}?sessionId=${sessionId}`);

    ws.on("open", async () => {
      try {
        await waitForOpenSocket(ws);
        wsConnected = true;
        console.log(
          `User ${userId}, Request ${requestId}: WebSocket connected`
        );
      } catch (error) {
        console.error(`WebSocket connection error: ${error.message}`);
        ws.close();
        resolve();
      }
    });

    ws.on("message", (data) => {
      const message = data.toString();
      outputBuffer += message;
      console.log(
        `User ${userId}, Request ${requestId} [Terminal]: ${message.trim()}`
      );

      if (inputIndex < config.simulatedInputs.length) {
        const { input, delayMs } = config.simulatedInputs[inputIndex];

        if (
          message.includes("Enter your name:") ||
          message.includes("Enter your age:")
        ) {
          setTimeout(() => {
            console.log(
              `User ${userId}, Request ${requestId} [Input]: ${input.trim()}`
            );
            ws.send(JSON.stringify({ type: "input", data: input }));
            inputIndex++;
          }, delayMs);
        }
      }
    });

    ws.on("close", () => {
      console.log(
        `User ${userId}, Request ${requestId}: WebSocket connection closed`
      );
      metrics.sessionsCompleted++;
      metrics.outputResponses.push(outputBuffer);
      resolve();
    });

    ws.on("error", (error) => {
      console.error(
        `User ${userId}, Request ${requestId}: WebSocket error: ${error.message}`
      );
      metrics.errors.push({
        phase: "websocket",
        message: error.message,
        userId,
        requestId,
        time: new Date().toISOString(),
      });

      metrics.sessionsWithErrors++;
      if (wsConnected) {
        ws.close();
      }
      resolve();
    });

    // Safety timeout in case the session hangs
    setTimeout(() => {
      if (wsConnected) {
        console.log(
          `User ${userId}, Request ${requestId}: Session timeout - closing connection`
        );
        metrics.errors.push({
          phase: "timeout",
          message: "Session timeout after 30 seconds",
          userId,
          requestId,
          time: new Date().toISOString(),
        });

        ws.close();
        resolve();
      }
    }, 30000);
  });
}

// Simulating a single user's behavior
async function simulateUser(userId) {
  console.log(`User ${userId} started testing interactive sessions`);

  for (let i = 0; i < config.requestsPerUser; i++) {
    await simulateInteractiveSession(userId, i + 1);

    // Add delay between requests for the same user
    if (i < config.requestsPerUser - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, config.delayBetweenRequestsMs)
      );
    }
  }

  console.log(`User ${userId} finished all interactive sessions`);
}

// Calculate and display metrics
function displayMetrics() {
  const totalSessions = metrics.sessionsStarted;
  const successRate = (metrics.sessionsCompleted / totalSessions) * 100;
  const totalDuration = metrics.endTime - metrics.startTime;

  console.log("\n========== INTERACTIVE TERMINAL TEST RESULTS ==========");
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Concurrent Users: ${config.concurrentUsers}`);
  console.log(`Sessions per User: ${config.requestsPerUser}`);
  console.log(`Total Sessions Started: ${totalSessions}`);
  console.log(
    `Sessions Completed: ${metrics.sessionsCompleted} (${successRate.toFixed(
      2
    )}%)`
  );
  console.log(`Sessions With Errors: ${metrics.sessionsWithErrors}`);

  console.log("\n---------- THROUGHPUT ----------");
  console.log(
    `Sessions per second: ${(totalSessions / (totalDuration / 1000)).toFixed(
      2
    )}`
  );

  if (metrics.errors.length > 0) {
    console.log("\n---------- ERROR SUMMARY ----------");
    const errorPhases = {};
    metrics.errors.forEach((error) => {
      const key = `${error.phase}: ${error.message}`;
      errorPhases[key] = (errorPhases[key] || 0) + 1;
    });

    Object.entries(errorPhases).forEach(([error, count]) => {
      console.log(`${error}: ${count} occurrences`);
    });
  }

  console.log("\n---------- SAMPLE OUTPUT ----------");
  if (metrics.outputResponses.length > 0) {
    console.log(metrics.outputResponses[0]);
  }
  console.log("=======================================");
}

// Main function to run the interactive terminal test
async function runInteractiveTest() {
  console.log(
    `Starting interactive terminal test with ${config.concurrentUsers} concurrent users...`
  );
  metrics.startTime = performance.now();

  const userPromises = [];
  for (let i = 0; i < config.concurrentUsers; i++) {
    userPromises.push(simulateUser(i + 1));
  }

  await Promise.all(userPromises);

  metrics.endTime = performance.now();
  displayMetrics();
}

// Run the interactive terminal test
runInteractiveTest().catch(console.error);
