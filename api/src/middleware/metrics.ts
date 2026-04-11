import { createMiddleware } from "hono/factory";
import type { CloudflareEnv } from "../types";

interface MetricsData {
  path: string;
  method: string;
  status: number;
  duration: number;
  timestamp: string;
}

/**
 * Metrics collection middleware
 * Tracks API performance and usage
 */
export const metricsMiddleware = createMiddleware<{
  Bindings: CloudflareEnv;
}>(async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const path = c.req.path;
  const method = c.req.method;
  const status = c.res.status;

  // Log metrics
  const metrics: MetricsData = {
    path,
    method,
    status,
    duration,
    timestamp: new Date().toISOString(),
  };

  // Log to console (in production, send to analytics)
  console.log(`[METRICS] ${method} ${path} ${status} ${duration}ms`);

  // Send to analytics asynchronously (don't block response)
  c.executionCtx?.waitUntil(sendMetrics(metrics, c.env));
});

/**
 * Send metrics to analytics
 * In production, this could send to:
 * - Cloudflare Analytics
 * - DataDog
 * - Prometheus
 * - Custom endpoint
 */
async function sendMetrics(
  metrics: MetricsData,
  env: CloudflareEnv
): Promise<void> {
  try {
    // Store in KV for aggregation
    const key = `metrics:${new Date().toISOString().slice(0, 10)}:${Date.now()}`;
    await env.COLLECT_KV.put(key, JSON.stringify(metrics), {
      expirationTtl: 86400 * 7, // 7 days
    });

    // In production, also send to external analytics
    // Example:
    // await fetch('https://analytics.example.com/api/metrics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(metrics),
    // });
  } catch (error) {
    // Fail silently - don't affect API responses
    console.error("Failed to send metrics:", error);
  }
}

/**
 * Get API statistics
 */
export async function getApiStats(
  env: CloudflareEnv
): Promise<{
  totalRequests: number;
  avgDuration: number;
  errorRate: number;
  topEndpoints: Array<{ path: string; count: number; avgDuration: number }>;
}> {
  // This is a placeholder - in production, aggregate from KV or analytics
  return {
    totalRequests: 0,
    avgDuration: 0,
    errorRate: 0,
    topEndpoints: [],
  };
}
