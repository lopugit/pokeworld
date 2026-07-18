const path = require("node:path");

const root = __dirname;
const port = 3847;

module.exports = {
  apps: [
    {
      name: `pokeworld-nitro-react-${port}`,
      namespace: "pokeworld",
      cwd: root,
      script: path.join(root, "node_modules/vite/bin/vite.js"),
      args: "dev",
      autorestart: false,
      watch: false,
      kill_timeout: 5000,
      time: true,
      env: {
        NODE_ENV: "development",
        PORT: String(port),
        WORKFLOW_LOCAL_BASE_URL: `http://127.0.0.1:${port}`,
        WORKFLOW_TARGET_WORLD: "local",
      },
    },
  ],
};
