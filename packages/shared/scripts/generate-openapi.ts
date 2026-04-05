import { writeFileSync } from "fs";
import { z } from "zod";
import {
  extendZodWithOpenApi,
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";

// Extend Zod with OpenAPI
extendZodWithOpenApi(z);

// Import schemas
import {
  UserSchema,
  FolderSchema,
  CreateFolderSchema,
  UpdateFolderSchema,
  FeedSchema,
  CreateFeedSchema,
  UpdateFeedSchema,
  ArticleSchema,
  UpdateArticleSchema,
  OPMLFeedSchema,
} from "../src/schemas/index.js";

const registry = new OpenAPIRegistry();

// Register schemas
registry.register("User", UserSchema);
registry.register("Folder", FolderSchema);
registry.register("CreateFolderInput", CreateFolderSchema);
registry.register("UpdateFolderInput", UpdateFolderSchema);
registry.register("Feed", FeedSchema);
registry.register("CreateFeedInput", CreateFeedSchema);
registry.register("UpdateFeedInput", UpdateFeedSchema);
registry.register("Article", ArticleSchema);
registry.register("UpdateArticleInput", UpdateArticleSchema);
registry.register("OPMLFeed", OPMLFeedSchema);

// Generate OpenAPI document
const generator = new OpenApiGeneratorV3(registry.definitions);

const openApiDoc = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Collect API",
    description: "A modern RSS reader API",
  },
  servers: [
    {
      url: "/api",
      description: "API base path",
    },
  ],
  tags: [
    { name: "Auth", description: "Authentication operations" },
    { name: "Folders", description: "Folder management" },
    { name: "Feeds", description: "RSS feed management" },
    { name: "Articles", description: "Article management" },
    { name: "OPML", description: "OPML import/export" },
  ],
});

// Add paths manually since we can't auto-generate from Hono routes
const paths = {
  "/folders": {
    get: {
      tags: ["Folders"],
      summary: "List folders",
      responses: {
        "200": {
          description: "List of folders",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Folder" },
            },
          },
        },
      },
    },
    post: {
      tags: ["Folders"],
      summary: "Create folder",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateFolderInput" },
          },
        },
      },
      responses: {
        "201": {
          description: "Created folder",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Folder" },
            },
          },
        },
      },
    },
  },
  "/feeds": {
    get: {
      tags: ["Feeds"],
      summary: "List feeds",
      responses: {
        "200": {
          description: "List of feeds",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Feed" },
            },
          },
        },
      },
    },
    post: {
      tags: ["Feeds"],
      summary: "Create feed",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateFeedInput" },
          },
        },
      },
      responses: {
        "201": {
          description: "Created feed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Feed" },
            },
          },
        },
      },
    },
  },
  "/articles": {
    get: {
      tags: ["Articles"],
      summary: "List articles",
      parameters: [
        {
          name: "feedId",
          in: "query",
          schema: { type: "string" },
        },
        {
          name: "isRead",
          in: "query",
          schema: { type: "boolean" },
        },
        {
          name: "isStarred",
          in: "query",
          schema: { type: "boolean" },
        },
      ],
      responses: {
        "200": {
          description: "List of articles",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Article" },
            },
          },
        },
      },
    },
  },
  "/articles/{id}": {
    put: {
      tags: ["Articles"],
      summary: "Update article",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateArticleInput" },
          },
        },
      },
      responses: {
        "200": {
          description: "Updated article",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Article" },
            },
          },
        },
      },
    },
  },
  "/opml": {
    get: {
      tags: ["OPML"],
      summary: "Export OPML",
      responses: {
        "200": {
          description: "OPML file",
          content: {
            "text/xml": {},
          },
        },
      },
    },
    post: {
      tags: ["OPML"],
      summary: "Import OPML",
      requestBody: {
        content: {
          "text/xml": {},
        },
      },
      responses: {
        "200": {
          description: "Import result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  feedsImported: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/refresh": {
    post: {
      tags: ["Feeds"],
      summary: "Refresh RSS feeds",
      responses: {
        "200": {
          description: "Refresh result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  feedsProcessed: { type: "number" },
                  articlesAdded: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Merge paths into document
openApiDoc.paths = paths;

// Write to file
const outputPath = process.argv[2] || "../../openapi.json";
writeFileSync(outputPath, JSON.stringify(openApiDoc, null, 2));

console.log(`✅ OpenAPI spec generated: ${outputPath}`);
