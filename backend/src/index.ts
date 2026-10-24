import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config, isSimulated, validateRealModeConfig } from "./config.js";
import { relayerService } from "./relayer.js";

export const app = new Hono();

// Enable CORS for frontend origin (http://localhost:3000)
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow localhost:3000 and standard local frontend hosts
      if (
        !origin ||
        origin.includes("localhost:3000") ||
        origin.includes("127.0.0.1:3000") ||
        origin.includes("localhost:3001")
      ) {
        return origin || "http://localhost:3000";
      }
      return origin;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (c) => {
  return c.json({
    status: "ok",
    mode: isSimulated() ? "simulated" : "real",
  });
});

// POST /api/requests: Start proof pipeline
app.post("/api/requests", async (c) => {
  try {
    const body = await c.req.json();
    const { txHash, sourceChainId } = body;
    if (!txHash) {
      return c.json({ error: "txHash is required" }, 400);
    }

    const id = relayerService.createRequest(txHash, sourceChainId || 11155111);
    return c.json({ id });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to create request" }, 500);
  }
});

// GET /api/requests/:id: Retrieve request status and all four steps
app.get("/api/requests/:id", (c) => {
  const id = c.req.param("id");
  const record = relayerService.getRequest(id);
  if (!record) {
    return c.json({ error: "Request not found" }, 404);
  }

  return c.json({
    id: record.id,
    steps: record.steps,
  });
});

// POST /api/requests/:id/verify: Trigger Amoy verification
app.post("/api/requests/:id/verify", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const tamper = Boolean(body.tamper);

    await relayerService.verifyRequest(id, tamper);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to verify request" }, 500);
  }
});

const isTest =
  process.env.NODE_ENV === "test" ||
  process.argv.some((a) => a.includes("test") || a.includes("e2e") || a.endsWith(".test.ts"));

if (!isTest) {
  const mode = isSimulated() ? "simulated" : "real";
  console.log(`MODE: ${mode.toUpperCase()}`);

  if (mode === "real") {
    try {
      validateRealModeConfig();
    } catch (err: any) {
      console.error(`FATAL STARTUP ERROR: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`ProofLink Backend listening on port ${config.port}`);
  serve({
    fetch: app.fetch,
    port: config.port,
  });
}
