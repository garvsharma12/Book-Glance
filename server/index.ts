/**
 * BookGlance - AI Book Discovery Application
 * 
 * Copyright (c) 2025 BookGlance. All rights reserved.
 * 
 * This software is proprietary. Unauthorized commercial use, reproduction,
 * or distribution is strictly prohibited and may result in legal action.
 * 
 * Source available for reference and educational purposes only.
 * 
 * For licensing inquiries: shelfscannerapp@gmail.com
 */

import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";
import { ensureDeviceId } from "./middleware/deviceId.js";

const app = express();

// Increase payload limit to 50MB for handling large CSV files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use(ensureDeviceId);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on configurable port with fallback to 5000
  // In development, we can use any available port
  // In production on Vercel, this will be handled differently
  const port = process.env.PORT ? parseInt(process.env.PORT) : (process.env.USE_PG_MEM ? 5001 : 5000);
  const host = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
  
  server.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
  });
})();
