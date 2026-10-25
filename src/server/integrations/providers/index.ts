import "server-only";
import type { Platform } from "@/lib/platforms/registry";
import type { SocialProvider } from "../types";
import { createPlaceholderProvider } from "./placeholder";

/*
 * Official integrations to implement. Endpoints and scopes are recorded here so
 * an implementation can replace the placeholder without changing callers.
 * Verify them against each platform's current documentation and app review
 * requirements before going live.
 */
export const PROVIDERS: Record<Platform, SocialProvider> = {
  instagram: createPlaceholderProvider({
    platform: "instagram",
    envKeys: ["INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"],
    scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"],
    capabilities: {
      publish: { text: false, image: true, video: true, carousel: true },
      analytics: true,
      tokenRefresh: true,
      revoke: false,
      idempotentPublish: false,
    },
    docs: {
      developerPortal: "https://developers.facebook.com/docs/instagram-platform",
      authorizeEndpoint: "https://www.instagram.com/oauth/authorize",
      tokenEndpoint: "https://api.instagram.com/oauth/access_token",
      notes:
        "Instagram API with Instagram Login. Exchange for a long-lived token, publish via /{ig-user-id}/media + /media_publish (media must be at public URLs). Requires Meta app review for content publishing.",
    },
  }),
  tiktok: createPlaceholderProvider({
    platform: "tiktok",
    envKeys: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    scopes: ["user.info.basic", "user.info.stats", "video.list", "video.publish", "video.upload"],
    capabilities: {
      publish: { text: false, image: true, video: true, carousel: true },
      analytics: true,
      tokenRefresh: true,
      revoke: true,
      idempotentPublish: false,
    },
    docs: {
      developerPortal: "https://developers.tiktok.com/doc/content-posting-api-get-started",
      authorizeEndpoint: "https://www.tiktok.com/v2/auth/authorize/",
      tokenEndpoint: "https://open.tiktokapis.com/v2/oauth/token/",
      notes:
        "Content Posting API (direct post). Query creator info before each post for privacy options and max duration. Unaudited apps can only post privately.",
    },
  }),
  facebook: createPlaceholderProvider({
    platform: "facebook",
    envKeys: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights"],
    capabilities: {
      publish: { text: true, image: true, video: true, carousel: true },
      analytics: true,
      tokenRefresh: false,
      revoke: true,
      idempotentPublish: false,
    },
    docs: {
      developerPortal: "https://developers.facebook.com/docs/pages-api",
      authorizeEndpoint: "https://www.facebook.com/dialog/oauth",
      tokenEndpoint: "https://graph.facebook.com/oauth/access_token",
      notes: "Use a Page access token derived from a long-lived user token. Requires Meta app review for page permissions.",
    },
  }),
  youtube: createPlaceholderProvider({
    platform: "youtube",
    envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    capabilities: {
      publish: { text: false, image: false, video: true, carousel: false },
      analytics: true,
      tokenRefresh: true,
      revoke: true,
      idempotentPublish: false,
    },
    docs: {
      developerPortal: "https://developers.google.com/youtube/v3",
      authorizeEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      notes:
        "Resumable uploads via videos.insert. Request access_type=offline for refresh tokens. Unverified projects upload as private only; uploads cost API quota.",
    },
  }),
  linkedin: createPlaceholderProvider({
    platform: "linkedin",
    envKeys: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    scopes: ["openid", "profile", "w_member_social", "r_organization_social", "w_organization_social", "rw_organization_admin"],
    capabilities: {
      publish: { text: true, image: true, video: true, carousel: true },
      analytics: true,
      tokenRefresh: true,
      revoke: false,
      idempotentPublish: false,
    },
    docs: {
      developerPortal: "https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api",
      authorizeEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
      tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
      notes: "Posts API with versioned headers. Organization posting and analytics need the Community Management API product.",
    },
  }),
  x: createPlaceholderProvider({
    platform: "x",
    envKeys: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
    capabilities: {
      publish: { text: true, image: true, video: true, carousel: true },
      analytics: true,
      tokenRefresh: true,
      revoke: true,
      idempotentPublish: false,
    },
    docs: {
      developerPortal: "https://docs.x.com/x-api/posts/manage-tweets/introduction",
      authorizeEndpoint: "https://x.com/i/oauth2/authorize",
      tokenEndpoint: "https://api.x.com/2/oauth2/token",
      notes: "OAuth 2.0 with PKCE (required). Posting volume and metrics depend on the purchased API access tier.",
    },
  }),
  pinterest: createPlaceholderProvider({
    platform: "pinterest",
    envKeys: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
    scopes: ["user_accounts:read", "boards:read", "pins:read", "pins:write"],
    capabilities: {
      publish: { text: false, image: true, video: true, carousel: true },
      analytics: true,
      tokenRefresh: true,
      revoke: false,
      idempotentPublish: false,
    },
    docs: {
      developerPortal: "https://developers.pinterest.com/docs/api/v5/",
      authorizeEndpoint: "https://www.pinterest.com/oauth/",
      tokenEndpoint: "https://api.pinterest.com/v5/oauth/token",
      notes: "Create pins on a board; Standard access requires Pinterest's app review.",
    },
  }),
};
