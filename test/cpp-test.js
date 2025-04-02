const axios = require("axios");
const { performance } = require("perf_hooks");
const { BASE_END_POINT } = require("../constants/endpoints");

// The C++ code to be executed
const cppCode = `#include <iostream>
int main()
{
    int level_1 = 78;
    int level_1_hour = level_1 / 60;
    int level_1_minutes = level_1 % 60;
    
    int level_2 = 144;
    int level_2_hour = level_2 / 60;
    int level_2_minutes = level_2 % 60;
    
    int time_difference = level_2 - level_1;
    int time_difference_hour = time_difference / 60;
    int time_difference_minutes = time_difference % 60;
    
    std::cout<<"It took " << level_1_hour << " hour(s) and " << level_1_minutes << " minutes to complete level 1\\n" ;
    std::cout<<"It took " << level_2_hour << " hour(s) and " << level_2_minutes << " minutes to complete level 2\\n" ;
    std::cout<<"It took " << time_difference_hour << " hour(s) and " << time_difference_minutes <<  " minutes from level 1 to level 2" ;
    return 0;
}`;

// Configuration
const config = {
  baseUrl: BASE_END_POINT, // Change to your API endpoint
  endpoint: "/execute",
  concurrentUsers: 10,
  requestsPerUser: 3,
  delayBetweenRequestsMs: 500,
};

// Metrics collection
const metrics = {
  successfulRequests: 0,
  failedRequests: 0,
  totalResponseTime: 0,
  minResponseTime: Infinity,
  maxResponseTime: 0,
  responseTimes: [],
  errors: [],
  startTime: 0,
  endTime: 0,
};

// Function to make a single code execution request
async function executeCode() {
  const startTime = performance.now();

  try {
    const response = await axios.post(`${config.baseUrl}${config.endpoint}`, {
      code: cppCode,
      language: "cpp",
    });

    const endTime = performance.now();
    const responseTime = endTime - startTime;

    metrics.successfulRequests++;
    metrics.totalResponseTime += responseTime;
    metrics.minResponseTime = Math.min(metrics.minResponseTime, responseTime);
    metrics.maxResponseTime = Math.max(metrics.maxResponseTime, responseTime);
    metrics.responseTimes.push(responseTime);

    return { success: true, responseTime };
  } catch (error) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;

    metrics.failedRequests++;
    metrics.errors.push({
      message: error.message,
      code: error.response?.status || "NETWORK_ERROR",
      time: new Date().toISOString(),
    });

    return { success: false, error, responseTime };
  }
}

// Simulating a single user's behavior
async function simulateUser(userId) {
  console.log(`User ${userId} started sending requests`);

  for (let i = 0; i < config.requestsPerUser; i++) {
    const result = await executeCode();

    console.log(
      `User ${userId}, Request ${i + 1}: ${
        result.success ? "Success" : "Failed"
      } - ${Math.round(result.responseTime)}ms`
    );

    // Add delay between requests for the same user
    if (i < config.requestsPerUser - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, config.delayBetweenRequestsMs)
      );
    }
  }

  console.log(`User ${userId} finished all requests`);
}

// Calculate and display metrics
function displayMetrics() {
  const totalRequests = metrics.successfulRequests + metrics.failedRequests;
  const avgResponseTime =
    metrics.totalResponseTime / metrics.successfulRequests || 0;
  const successRate = (metrics.successfulRequests / totalRequests) * 100;
  const totalDuration = metrics.endTime - metrics.startTime;

  // Calculate percentiles
  const sortedResponseTimes = [...metrics.responseTimes].sort((a, b) => a - b);
  const p50 =
    sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.5)] || 0;
  const p90 =
    sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.9)] || 0;
  const p95 =
    sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)] || 0;
  const p99 =
    sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)] || 0;

  console.log("\n========== LOAD TEST RESULTS ==========");
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Concurrent Users: ${config.concurrentUsers}`);
  console.log(`Requests per User: ${config.requestsPerUser}`);
  console.log(`Total Requests: ${totalRequests}`);
  console.log(
    `Successful Requests: ${metrics.successfulRequests} (${successRate.toFixed(
      2
    )}%)`
  );
  console.log(`Failed Requests: ${metrics.failedRequests}`);
  console.log("\n---------- RESPONSE TIMES ----------");
  console.log(`Average: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`Min: ${metrics.minResponseTime.toFixed(2)}ms`);
  console.log(`Max: ${metrics.maxResponseTime.toFixed(2)}ms`);
  console.log(`P50: ${p50.toFixed(2)}ms`);
  console.log(`P90: ${p90.toFixed(2)}ms`);
  console.log(`P95: ${p95.toFixed(2)}ms`);
  console.log(`P99: ${p99.toFixed(2)}ms`);
  console.log("\n---------- THROUGHPUT ----------");
  console.log(
    `Requests per second: ${(totalRequests / (totalDuration / 1000)).toFixed(
      2
    )}`
  );

  if (metrics.errors.length > 0) {
    console.log("\n---------- ERROR SUMMARY ----------");
    const errorCounts = {};
    metrics.errors.forEach((error) => {
      const key = `${error.code}: ${error.message}`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    Object.entries(errorCounts).forEach(([error, count]) => {
      console.log(`${error}: ${count} occurrences`);
    });
  }
  console.log("=======================================");
}

// Main function to run the load test
async function runLoadTest() {
  console.log(
    `Starting load test with ${config.concurrentUsers} concurrent users...`
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

// Run the load test
runLoadTest().catch(console.error);
