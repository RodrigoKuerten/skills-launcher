import { startServer } from "./server.js";
import { formatPairing } from "./server.js";

void startServer()
  .then((running) => {
    console.log(formatPairing(running));
  })
  .catch((error) => {
    console.error(
      `Could not start the Skills Hub agent: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
