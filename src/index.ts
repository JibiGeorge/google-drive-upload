import "./config/env"; // validate env vars before anything else
import { createApp } from "./app";
import { config } from "./config/env";

const app = createApp();
const { port, nodeEnv } = config.server;

app.listen(port, () => {
  console.log(`\n🚀 Drive Upload Service running`);
  console.log(`   Environment : ${nodeEnv}`);
  console.log(`   Port        : ${port}`);
  console.log(`   Health      : http://localhost:${port}/health`);
  console.log(`   Upload      : POST http://localhost:${port}/api/drive/upload\n`);
});
