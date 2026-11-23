import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";

export async function GET() {
  const appUrl = getAppUrl();

  const openApiDoc = {
    openapi: "3.0.3",
    info: {
      title: "Entrivo Public REST API",
      version: "1.0.0",
      description:
        "Enterprise visitor management platform public REST API. Enables third-party platforms, automation workflows (Zapier, Make.com), and custom systems to query visitors, manage invitations, review check-in telemetry, and subscribe to real-time webhook events.",
      contact: {
        name: "Entrivo Developer Support",
        email: "developers@entrivo.com",
        url: `${appUrl}/developers`,
      },
    },
    servers: [
      {
        url: `${appUrl}/api/v1`,
        description: "Primary API v1 Server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key (ent_live_* or ent_test_*)",
          description: "Provide your Entrivo API key with prefix `ent_live_` or `ent_test_`.",
        },
      },
      schemas: {
        ErrorEnvelope: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string", example: "Invalid or expired API key" },
            code: { type: "string", example: "UNAUTHORIZED" },
          },
          required: ["success", "error"],
        },
        Visitor: {
          type: "object",
          properties: {
            id: { type: "string", example: "cly01abcde" },
            name: { type: "string", example: "Rajesh Sharma" },
            email: { type: "string", format: "email", example: "rajesh@example.com" },
            phone: { type: "string", example: "+919876543210" },
            company: { type: "string", example: "Acme Corp" },
            avatarUrl: { type: "string", nullable: true },
            isBlacklisted: { type: "boolean", example: false },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Invitation: {
          type: "object",
          properties: {
            id: { type: "string", example: "inv_12345" },
            status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"] },
            scheduledDate: { type: "string", format: "date", example: "2026-11-15" },
            startTime: { type: "string", example: "10:00" },
            endTime: { type: "string", example: "11:00" },
            purpose: { type: "string", example: "Quarterly Strategy Review" },
            qrToken: { type: "string", example: "INV-89AF12BC" },
            passUrl: { type: "string", example: `${appUrl}/pass/INV-89AF12BC` },
            visitor: { $ref: "#/components/schemas/Visitor" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CheckIn: {
          type: "object",
          properties: {
            id: { type: "string", example: "chk_67890" },
            status: { type: "string", enum: ["CHECKED_IN", "CHECKED_OUT"] },
            badgeNumber: { type: "string", example: "B-1042" },
            checkInTime: { type: "string", format: "date-time" },
            visitor: { $ref: "#/components/schemas/Visitor" },
            checkOut: {
              type: "object",
              nullable: true,
              properties: {
                checkOutTime: { type: "string", format: "date-time" },
                durationMinutes: { type: "integer", example: 45 },
                checkoutMethod: { type: "string", example: "KIOSK" },
              },
            },
          },
        },
        Employee: {
          type: "object",
          properties: {
            id: { type: "string" },
            employeeCode: { type: "string", example: "EMP-042" },
            designation: { type: "string", example: "Senior Architect" },
            phone: { type: "string" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string", example: "Aksh Kanani" },
                email: { type: "string", example: "aksh@entrivo.com" },
                role: { type: "string", example: "ORG_ADMIN" },
              },
            },
          },
        },
        WebhookSubscription: {
          type: "object",
          properties: {
            id: { type: "string" },
            target_url: { type: "string", format: "uri", example: "https://hooks.zapier.com/hooks/catch/1234/abc/" },
            events: {
              type: "array",
              items: { type: "string" },
              example: ["visitor.checked_in", "visitor.checked_out"],
            },
            isActive: { type: "boolean", example: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    paths: {
      "/visitors": {
        get: {
          summary: "List Visitors",
          description: "Retrieve paginated list of visitors registered in your organization.",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search by name, email, phone, or company" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: {
            200: {
              description: "Paginated visitor list",
              content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/Visitor" } } } } } },
            },
            401: { $ref: "#/components/schemas/ErrorEnvelope" },
            403: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
        post: {
          summary: "Create or Update Visitor Profile",
          description: "Register a new visitor or update an existing visitor profile.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "phone"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    phone: { type: "string" },
                    company: { type: "string" },
                    visitorTypeId: { type: "string" },
                    idProofType: { type: "string" },
                    idProofNumber: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Visitor created successfully" },
            400: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      },
      "/visitors/{id}": {
        get: {
          summary: "Get Visitor Details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Visitor details" },
            404: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      },
      "/invitations": {
        get: {
          summary: "List Invitations",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"] } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: {
            200: { description: "Invitation list" },
          },
        },
        post: {
          summary: "Create New Visitor Invitation",
          description: "Schedules a visit, generates a digital QR pass, dispatches email with .ics calendar attachment, and syncs to host calendar.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["visitorName", "visitorEmail", "visitorPhone", "hostEmployeeId", "scheduledDate", "purpose"],
                  properties: {
                    visitorName: { type: "string" },
                    visitorEmail: { type: "string", format: "email" },
                    visitorPhone: { type: "string" },
                    visitorCompany: { type: "string" },
                    hostEmployeeId: { type: "string" },
                    scheduledDate: { type: "string", example: "2026-11-20" },
                    startTime: { type: "string", example: "14:00" },
                    endTime: { type: "string", example: "15:00" },
                    purpose: { type: "string" },
                    meetingRoomId: { type: "string" },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Invitation created" },
            400: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      },
      "/invitations/{id}": {
        get: {
          summary: "Get Invitation Details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Invitation details" }, 404: { $ref: "#/components/schemas/ErrorEnvelope" } },
        },
      },
      "/invitations/{id}/cancel": {
        post: {
          summary: "Cancel Invitation",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } },
          },
          responses: { 200: { description: "Cancelled successfully" } },
        },
      },
      "/invitations/{id}/reschedule": {
        post: {
          summary: "Reschedule Invitation",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["scheduledDate"],
                  properties: {
                    scheduledDate: { type: "string", example: "2026-11-25" },
                    startTime: { type: "string", example: "11:00" },
                    endTime: { type: "string", example: "12:00" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Rescheduled successfully" } },
        },
      },
      "/checkins": {
        get: {
          summary: "List Check-ins",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["CHECKED_IN", "CHECKED_OUT"] } },
            { name: "date", in: "query", schema: { type: "string", example: "2026-11-02" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Check-in list" } },
        },
      },
      "/checkins/{id}": {
        get: {
          summary: "Get Check-in Details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Check-in details" } },
        },
      },
      "/employees": {
        get: {
          summary: "List Host Employees",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { 200: { description: "Employee list" } },
        },
      },
      "/employees/{id}": {
        get: {
          summary: "Get Employee Details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Employee details" } },
        },
      },
      "/webhooks": {
        get: {
          summary: "List REST-hook Subscriptions",
          responses: { 200: { description: "Webhook list" } },
        },
        post: {
          summary: "Subscribe to Webhook Events (Zapier / Make style)",
          description: "Register a REST-hook subscription. Supports target_url format used by Zapier and Make.com.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["target_url", "event"],
                  properties: {
                    target_url: { type: "string", format: "uri", example: "https://hooks.zapier.com/hooks/catch/..." },
                    event: { type: "string", example: "visitor.checked_in" },
                    secret: { type: "string", description: "Optional custom HMAC secret" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Subscription created" } },
        },
      },
      "/webhooks/{id}": {
        delete: {
          summary: "Unsubscribe Webhook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Unsubscribed successfully" } },
        },
      },
    },
  };

  return NextResponse.json(openApiDoc, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

