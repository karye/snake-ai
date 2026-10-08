# Bun-native app: no npm install needed, the engine runs in the browser.
FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public

RUN mkdir -p data

EXPOSE 3020

# for real classrooms mount the results file so it survives container restarts:
#   docker run -p 3020:3020 -v ./data:/app/data snake-ai
CMD ["bun", "run", "src/index.js"]
