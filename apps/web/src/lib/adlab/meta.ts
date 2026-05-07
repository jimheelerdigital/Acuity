/**
 * Meta Marketing API helper for AdLab.
 * Uses facebook-nodejs-business-sdk.
 *
 * IMPORTANT: never call launch endpoints without explicit user click in the UI.
 * No auto-launch on creative approval.
 */

// Dynamic import to avoid build-time destructure failures when
// META_ACCESS_TOKEN is not set (the SDK tries to init on import).
let _sdk: typeof import("facebook-nodejs-business-sdk") | null = null;

async function getSdk() {
  if (!_sdk) _sdk = await import("facebook-nodejs-business-sdk");
  return _sdk;
}

async function getApi() {
  const sdk = await getSdk();
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not configured");

  const api = sdk.default.FacebookAdsApi.init(token);
  api.setDebug(process.env.NODE_ENV === "development");
  return api;
}

async function getAdAccount() {
  const sdk = await getSdk();
  await getApi(); // ensure initialized
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!accountId) throw new Error("META_AD_ACCOUNT_ID not configured");
  return new sdk.default.AdAccount(accountId.startsWith("act_") ? accountId : `act_${accountId}`);
}

interface CampaignParams {
  name: string;
  objective: string;
}

export async function createCampaign(params: CampaignParams) {
  await getApi();
  const account = await getAdAccount();

  const campaign = await account.createCampaign([], {
    name: params.name,
    objective: params.objective,
    status: "PAUSED",
    special_ad_categories: ["NONE"],
    buying_type: "AUCTION",
  });

  return campaign.id;
}

interface AdSetParams {
  campaignId: string;
  name: string;
  dailyBudgetCents: number;
  pixelId: string;
  conversionEvent: string;
  targetAudience: {
    ageMin?: number;
    ageMax?: number;
    geo?: string[];
    interests?: string[];
  };
}

export async function createAdSet(params: AdSetParams) {
  await getApi();
  const account = await getAdAccount();

  const targeting: Record<string, unknown> = {};

  if (params.targetAudience.ageMin) targeting.age_min = params.targetAudience.ageMin;
  if (params.targetAudience.ageMax) targeting.age_max = params.targetAudience.ageMax;
  if (params.targetAudience.geo?.length) {
    targeting.geo_locations = {
      countries: params.targetAudience.geo,
    };
  }
  // TODO: Map interest names to Meta interest IDs via Interest Search API.
  // For now, use broad targeting (Advantage+) and let Meta optimize.

  const adset = await account.createAdSet([], {
    name: params.name,
    campaign_id: params.campaignId,
    daily_budget: params.dailyBudgetCents, // Meta API takes cents
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    promoted_object: {
      pixel_id: params.pixelId,
      custom_event_type: params.conversionEvent,
    },
    targeting,
    status: "PAUSED",
    // Advantage+ automatic placements
  });

  return adset.id;
}

interface AdCreativeParams {
  name: string;
  pageId: string;
  imageHash?: string;
  imageUrl?: string;
  videoId?: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  linkUrl: string;
}

export async function uploadImage(imageUrl: string): Promise<string> {
  await getApi();
  const account = await getAdAccount();

  const image = await account.createAdImage([], {
    url: imageUrl,
  });

  // The response shape varies — try common patterns
  const hash = image?.images?.bytes?.hash || image?.hash || Object.values(image?.images || {})?.[0]?.hash;
  if (!hash) throw new Error("Failed to get image hash from Meta upload");
  return hash;
}

export async function uploadVideo(videoUrl: string): Promise<string> {
  await getApi();
  const account = await getAdAccount();

  const video = await account.createAdVideo([], {
    file_url: videoUrl,
  });

  const videoId = video?.id;
  if (!videoId) throw new Error("Failed to get video ID from Meta upload");

  // Poll until video is processed (Meta needs ~30-60s)
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const sdk = await getSdk();
    const v = new sdk.default.AdVideo(videoId);
    const status = await v.get(["status"]);
    if (status?.status?.video_status === "ready") return videoId;
  }

  // Return anyway — Meta may still process it
  return videoId;
}

export async function createAdCreative(params: AdCreativeParams) {
  await getApi();
  const account = await getAdAccount();

  let objectStorySpec: Record<string, unknown>;

  if (params.videoId) {
    // Video creative
    objectStorySpec = {
      page_id: params.pageId,
      video_data: {
        video_id: params.videoId,
        message: params.primaryText,
        title: params.headline,
        link_description: params.description,
        call_to_action: { type: params.cta, value: { link: params.linkUrl } },
      },
    };
  } else {
    // Image creative
    objectStorySpec = {
      page_id: params.pageId,
      link_data: {
        message: params.primaryText,
        link: params.linkUrl,
        name: params.headline,
        description: params.description,
        call_to_action: { type: params.cta },
        ...(params.imageHash ? { image_hash: params.imageHash } : {}),
      },
    };
  }

  const creative = await account.createAdCreative([], {
    name: params.name,
    object_story_spec: objectStorySpec,
  });

  return creative.id;
}

interface CreateAdParams {
  name: string;
  adsetId: string;
  creativeId: string;
}

export async function createAd(params: CreateAdParams) {
  await getApi();
  const account = await getAdAccount();

  const ad = await account.createAd([], {
    name: params.name,
    adset_id: params.adsetId,
    creative: { creative_id: params.creativeId },
    status: "PAUSED",
  });

  return ad.id;
}

export async function setStatus(objectId: string, type: "campaign" | "adset" | "ad", status: "ACTIVE" | "PAUSED") {
  const sdk = await getSdk();
  await getApi();

  if (type === "campaign") {
    const campaign = new sdk.default.Campaign(objectId);
    await campaign.update([], { status });
  } else if (type === "adset") {
    const adset = new sdk.default.AdSet(objectId);
    await adset.update([], { status });
  } else {
    const ad = new sdk.default.Ad(objectId);
    await ad.update([], { status });
  }
}

export async function updateAdSetBudget(adsetId: string, dailyBudgetCents: number) {
  const sdk = await getSdk();
  await getApi();
  const adset = new sdk.default.AdSet(adsetId);
  await adset.update([], { daily_budget: dailyBudgetCents });
}

export async function deleteCampaign(campaignId: string) {
  const sdk = await getSdk();
  await getApi();
  const campaign = new sdk.default.Campaign(campaignId);
  await campaign.delete([]);
}

export async function getAdInsights(adId: string, since: string, until: string) {
  const sdk = await getSdk();
  await getApi();
  const ad = new sdk.default.Ad(adId);

  const insights = await ad.getInsights(
    ["impressions", "clicks", "ctr", "spend", "actions", "frequency", "cpc"],
    {
      time_range: { since, until },
      level: "ad",
    }
  );

  return insights;
}
