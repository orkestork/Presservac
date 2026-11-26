export type MediaPlatform = "YouTube" | "Instagram" | "TikTok";

export type MediaItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  platform: MediaPlatform;
  href: string;
  embedUrl: string;
  accent: string;
};

export const mediaHubItems: MediaItem[] = [];
