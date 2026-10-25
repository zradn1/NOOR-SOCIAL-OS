import { z } from "zod";
import { ROLES, WORKSPACE_ROLES } from "@/lib/auth/permissions";
import { isValidTimeZone } from "@/lib/time/timezones";
import { emailSchema } from "./auth";

export const timeZoneSchema = z.string().refine(isValidTimeZone, "Choose a valid time zone.");

const nameSchema = (what: string) =>
  z.string().trim().min(2, `${what} must be at least 2 characters.`).max(80, `${what} must be at most 80 characters.`);

export const createOrganizationSchema = z.object({
  organizationName: nameSchema("Organization name"),
  workspaceName: nameSchema("Workspace name"),
  timezone: timeZoneSchema,
  createDemo: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const createWorkspaceSchema = z.object({
  name: nameSchema("Workspace name"),
  kind: z.enum(["internal", "client"]),
  timezone: timeZoneSchema,
  description: z.string().trim().max(280, "Use at most 280 characters.").optional(),
});

export const updateWorkspaceSchema = z.object({
  name: nameSchema("Workspace name"),
  timezone: timeZoneSchema,
  description: z.string().trim().max(280, "Use at most 280 characters.").optional(),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES).refine((r) => r !== "owner", "Owners can't be invited; promote a member instead."),
  workspaceIds: z.array(z.uuid()).max(100).default([]),
  workspaceRole: z.enum(WORKSPACE_ROLES).optional(),
});

export const changeMemberRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(ROLES),
});

export const assignWorkspaceSchema = z.object({
  userId: z.uuid(),
  role: z.enum(WORKSPACE_ROLES),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  timezone: timeZoneSchema,
});
