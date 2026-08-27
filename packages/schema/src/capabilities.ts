export const CAPABILITY_IDS = [
  "visual.ad-slot.replace",
  "visual.hide",
  "network.browser.block",
  "network.egress",
  "youtube.home.allowlist",
  "youtube.watch.videoId",
  "reddit.comments.search",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type JsonSchema = Readonly<{
  type: "object";
  additionalProperties: false;
  required: readonly string[];
  properties: Readonly<Record<string, unknown>>;
}>;

export type CapabilityDefinition = Readonly<{
  id: CapabilityId;
  resultSchema?: JsonSchema;
}>;

const videoItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "href"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    href: { type: "string" },
  },
} as const;

const commentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["author", "body", "permalink"],
  properties: {
    author: { type: "string" },
    body: { type: "string" },
    permalink: { type: "string" },
  },
} as const;

export const CAPABILITY_REGISTRY: Readonly<
  Record<CapabilityId, CapabilityDefinition>
> = {
  "visual.ad-slot.replace": {
    id: "visual.ad-slot.replace",
  },
  "visual.hide": {
    id: "visual.hide",
  },
  "network.browser.block": {
    id: "network.browser.block",
  },
  "network.egress": {
    id: "network.egress",
  },
  "youtube.home.allowlist": {
    id: "youtube.home.allowlist",
    resultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["videos"],
      properties: {
        videos: {
          type: "array",
          items: videoItemSchema,
        },
      },
    },
  },
  "youtube.watch.videoId": {
    id: "youtube.watch.videoId",
    resultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["videoId"],
      properties: {
        videoId: { type: "string" },
      },
    },
  },
  "reddit.comments.search": {
    id: "reddit.comments.search",
    resultSchema: {
      type: "object",
      additionalProperties: false,
      required: ["comments"],
      properties: {
        comments: {
          type: "array",
          items: commentSchema,
        },
      },
    },
  },
};

export function isCapabilityId(value: string): value is CapabilityId {
  return Object.hasOwn(CAPABILITY_REGISTRY, value);
}
