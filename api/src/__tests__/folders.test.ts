import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import foldersRoute from "../routes/folders";
import { getDb } from "../db";
import type { CloudflareEnv } from "../types";

// Mock dependencies
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn(async (c, next) => {
    c.set("userId", "test-user-id");
    await next();
  }),
}));

describe("Folders API", () => {
  let app: Hono<{ Bindings: CloudflareEnv }>;
  let mockDb: any;
  const request = (input: string, init?: RequestInit) => app.request(
    input,
    init,
    { DB: {} as D1Database } as CloudflareEnv,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono<{ Bindings: CloudflareEnv }>();
    app.route("/api/folders", foldersRoute);

    mockDb = {
      select: vi.fn(() => mockDb),
      from: vi.fn(() => mockDb),
      where: vi.fn(() => mockDb),
      orderBy: vi.fn(() => mockDb),
      insert: vi.fn(() => mockDb),
      values: vi.fn(() => mockDb),
      returning: vi.fn(() => mockDb),
      update: vi.fn(() => mockDb),
      set: vi.fn(() => mockDb),
      delete: vi.fn(() => mockDb),
    };

    (getDb as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);
  });

  describe("GET /api/folders", () => {
    it("should return all folders for the user", async () => {
      const mockFolders = [
        { id: "1", name: "Tech", color: "#FF0000", userId: "test-user-id", sortOrder: 0 },
        { id: "2", name: "News", color: "#00FF00", userId: "test-user-id", sortOrder: 1 },
      ];

      mockDb.orderBy.mockResolvedValue(mockFolders);

      const res = await request("/api/folders", {
        headers: { "x-user-id": "test-user-id" },
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockFolders);
    });

    it("should handle database errors", async () => {
      mockDb.orderBy.mockRejectedValue(new Error("Database error"));

      const res = await request("/api/folders");

      expect(res.status).toBe(500);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error).toBe("Database error");
    });
  });

  describe("POST /api/folders", () => {
    it("rejects the reserved folder name", async () => {
      const res = await request("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: " 未分类 " }) });
      expect(res.status).toBe(400);
    });

    it("rejects renaming to the reserved folder name", async () => {
      const res = await request("/api/folders/1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "未分类" }) });
      expect(res.status).toBe(400);
    });
    it("should create a new folder", async () => {
      const newFolder = {
        id: "folder-1",
        name: "Technology",
        color: "#777777",
        icon: null,
        userId: "test-user-id",
        sortOrder: 0,
      };

      mockDb.orderBy.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([newFolder]);

      const res = await request("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Technology" }),
      });

      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.name).toBe("Technology");
    });

    it("should validate folder name is not empty", async () => {
      const res = await request("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
    });

    it("should use provided color and icon", async () => {
      const newFolder = {
        id: "folder-1",
        name: "Tech",
        color: "#123456",
        icon: "folder-icon",
        userId: "test-user-id",
        sortOrder: 0,
      };

      mockDb.orderBy.mockResolvedValue([]);
      mockDb.returning.mockResolvedValue([newFolder]);

      const res = await request("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tech", color: "#123456", icon: "folder-icon" }),
      });

      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.data.color).toBe("#123456");
      expect(json.data.icon).toBe("folder-icon");
    });
  });

  describe("GET /api/folders/:id", () => {
    it("should return a specific folder", async () => {
      const mockFolder = {
        id: "folder-1",
        name: "Tech",
        userId: "test-user-id",
      };

      mockDb.where.mockResolvedValueOnce([mockFolder]);

      const res = await request("/api/folders/folder-1");

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("folder-1");
    });

    it("should return 404 for non-existent folder", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const res = await request("/api/folders/non-existent");

      expect(res.status).toBe(404);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error).toBe("文件夹不存在");
    });
  });

  describe("PUT /api/folders/:id", () => {
    it("should update folder name", async () => {
      const existingFolder = { id: "folder-1", name: "Old Name", userId: "test-user-id" };
      const updatedFolder = { id: "folder-1", name: "New Name", userId: "test-user-id" };

      mockDb.where.mockResolvedValueOnce([existingFolder]);
      mockDb.returning.mockResolvedValueOnce([updatedFolder]);

      const res = await request("/api/folders/folder-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.name).toBe("New Name");
    });

    it("should return 404 when updating non-existent folder", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const res = await request("/api/folders/non-existent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
    });
  });

  describe("DELETE /api/folders/:id", () => {
    it("should delete a folder", async () => {
      const existingFolder = { id: "folder-1", name: "Tech", userId: "test-user-id" };

      mockDb.where.mockResolvedValueOnce([existingFolder]);

      const res = await request("/api/folders/folder-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("folder-1");
    });

    it("should return 404 when deleting non-existent folder", async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const res = await request("/api/folders/non-existent", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
    });
  });
});
