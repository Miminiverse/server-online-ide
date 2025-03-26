# Base image with common dependencies
FROM debian:latest AS base
RUN apt update && apt install -y build-essential python3 python3-pip nodejs

# Python execution image
FROM base AS python
WORKDIR /app
RUN ln -s /usr/bin/python3 /usr/bin/python  
CMD ["sh", "-c", "python /app/code.py"]

# C++ execution image
FROM base AS cpp
WORKDIR /app
CMD ["sh", "-c", "g++ /app/code.cpp -o /app/code && /app/code"]

# JavaScript (Node.js) execution image
FROM base AS javascript
WORKDIR /app
CMD ["sh", "-c", "node /app/code.js"]
