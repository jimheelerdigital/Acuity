/**
 * Meta Marketing API helper for AdLab.
 * Uses facebook-nodejs-business-sdk.
 *
 * IMPORTANT: never call launch endpoints without explicit user click in the UI.
 * No auto-launch on creative approval.
 */

/**
 * Strip access_token values from strings (URLs, error bodies) before logging.
 */
export function redactAccessToken(str: string): string {
  return str.replace(/access_token=[^&\s"']+/gi, "access_token=REDACTED");
}

// Dynamic import to avoid build-time destructure failures when
// META_ACCESS_TOKEN is not set (the SDK tries to init on import).
// The SDK uses module.exports (CJS), so dynamic import may or may not
// wrap it in .default depending on the bundler. We normalize here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _bizSdk: any = null;

async function getBizSdk() {
  if (!_bizSdk) {
    const mod = await import("facebook-nodejs-business-sdk");
    // CJS→ESM interop: default export may be at mod.default or mod itself
    _bizSdk = (mod as any).default ?? mod;
  }
  return _bizSdk;
}

async function getApi() {
  const bizSdk = await getBizSdk();
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not configured");

  const { FacebookAdsApi } = bizSdk;
  // Override SDK default API version (v24.0) with env var or v25.0
  const apiVersion = process.env.META_API_VERSION || "v25.0";
  Object.defineProperty(FacebookAdsApi, "VERSION", { get: () => apiVersion });
  const api = FacebookAdsApi.init(token);
  api.setDebug(process.env.NODE_ENV === "development");
  return api;
}

async function getAdAccount() {
  const bizSdk = await getBizSdk();
  await getApi(); // ensure initialized
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!accountId) throw new Error("META_AD_ACCOUNT_ID not configured");
  const { AdAccount } = bizSdk;
  return new AdAccount(accountId.startsWith("act_") ? accountId : `act_${accountId}`);
}

interface CampaignParams {
  name: string;
  objective: string;
}

export async function createCampaign(params: CampaignParams) {
  await getApi();
  const account = await getAdAccount();
  const accountId = process.env.META_AD_ACCOUNT_ID;
  console.log("[adlab-meta] Using ad account:", accountId);

  const payload = {
    name: params.name,
    objective: params.objective,
    status: "PAUSED",
    special_ad_categories: ["NONE"],
    buying_type: "AUCTION",
    is_adset_budget_sharing_enabled: false,
  };
  console.log("[adlab-meta] Campaign create payload:", JSON.stringify(payload, null, 2));

  const campaign = await account.createCampaign([], payload);

  return campaign.id;
}

// Meta uses ISO 3166-1 alpha-2 codes. Map common mistakes.
const COUNTRY_CODE_FIXES: Record<string, string> = {
  UK: "GB",
  EN: "GB",
};

function normalizeCountryCodes(codes: string[]): string[] {
  return codes.map((code) => {
    const upper = code.toUpperCase();
    const fixed = COUNTRY_CODE_FIXES[upper];
    if (fixed) {
      console.log(`[adlab-meta] Country code auto-corrected: "${upper}" → "${fixed}"`);
      return fixed;
    }
    if (upper.length !== 2) {
      console.warn(`[adlab-meta] Suspicious country code (not 2 chars): "${upper}"`);
    }
    return upper;
  });
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
  };
  targetInterests?: { id: string; name: string }[];
  placementType?: string | null;
  /** App install campaign overrides */
  appInstall?: {
    applicationId: string;
    objectStoreUrl: string;
  };
}

export async function createAdSet(params: AdSetParams) {
  await getApi();
  const account = await getAdAccount();

  const targeting: Record<string, unknown> = {};

  if (params.targetAudience.ageMin) targeting.age_min = params.targetAudience.ageMin;
  // Advantage+ audience requires age_max >= 65; the algorithm still optimizes
  // toward the actual target range, this is just Meta's floor requirement.
  const useAdvantageAudience = true; // matches targeting_automation below
  const ageMax = params.targetAudience.ageMax;
  if (ageMax) targeting.age_max = useAdvantageAudience ? Math.max(ageMax, 65) : ageMax;
  if (params.targetAudience.geo?.length) {
    targeting.geo_locations = {
      countries: normalizeCountryCodes(params.targetAudience.geo),
    };
  }
  if (params.targetInterests?.length) {
    targeting.flexible_spec = [
      { interests: params.targetInterests.map((i) => ({ id: i.id, name: i.name })) },
    ];
  }

  // Advantage Audience: required by Meta v25 API. Enabled (1) to let Meta
  // find the best converters within our age/geo/interest parameters.
  targeting.targeting_automation = { advantage_audience: 1 };

  // Placement: only set publisher_platforms for MANUAL; omit for Advantage+ (Meta default)
  const placementFields: Record<string, unknown> = {};
  if (params.placementType === "MANUAL") {
    placementFields.publisher_platforms = ["facebook", "instagram"];
  }

  // App install campaigns use different optimization, destination, and promoted_object
  const isAppInstall = !!params.appInstall;
  const payload: Record<string, unknown> = {
    name: params.name,
    campaign_id: params.campaignId,
    daily_budget: params.dailyBudgetCents, // Meta API takes cents
    optimization_goal: isAppInstall ? "APP_INSTALLS" : "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: isAppInstall ? "APP" : "WEBSITE",
    start_time: new Date().toISOString(),
    promoted_object: isAppInstall
      ? {
          application_id: params.appInstall!.applicationId,
          object_store_url: params.appInstall!.objectStoreUrl,
        }
      : {
          pixel_id: params.pixelId,
          custom_event_type: params.conversionEvent,
        },
    targeting,
    status: "PAUSED",
    ...placementFields,
  };
  console.log("[adlab-meta] Ad set create payload:", JSON.stringify(payload, null, 2));

  const adset = await account.createAdSet([], payload);

  return adset.id;
}

// ─── CTA type mapping ──────────────────────────────────────────────────────
const CTA_MAP: Record<string, string> = {
  "sign up": "SIGN_UP",
  "sign_up": "SIGN_UP",
  "learn more": "LEARN_MORE",
  "learn_more": "LEARN_MORE",
  "download": "DOWNLOAD",
  "get offer": "GET_OFFER",
  "get_offer": "GET_OFFER",
  "subscribe": "SUBSCRIBE",
};

export function mapCtaType(cta: string): string {
  return CTA_MAP[cta.toLowerCase().trim()] || "LEARN_MORE";
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

  // Fetch image and convert to base64 (bytes method avoids Meta's outbound HTTP requirement)
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) {
    throw new Error(`[adlab-meta] Failed to fetch image from ${imageUrl}: ${imgResponse.status}`);
  }
  const buffer = Buffer.from(await imgResponse.arrayBuffer());
  const base64String = buffer.toString("base64");

  console.log(`[adlab-meta] Uploading image via bytes method, size: ${buffer.length} bytes`);

  const image = await account.createAdImage([], {
    bytes: base64String,
  });

  // URL-based method (commented out — kept as fallback if bytes method fails):
  // const image = await account.createAdImage([], {
  //   url: imageUrl,
  // });

  // The response shape varies — try common patterns
  const hash = image?.images?.bytes?.hash || image?.hash || Object.values(image?.images || {})?.[0]?.hash;
  if (!hash) {
    console.error("[adlab-meta] Image upload failed: no hash in response", JSON.stringify(image));
    throw new Error("Failed to get image hash from Meta upload");
  }

  console.log(`[adlab-meta] Image upload success, hash: ${hash}`);
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
    const bizSdk = await getBizSdk();
    const v = new bizSdk.AdVideo(videoId);
    const status = await v.get(["status"]);
    if (status?.status?.video_status === "ready") return videoId;
  }

  // Return anyway — Meta may still process it
  return videoId;
}

export async function createAdCreative(params: AdCreativeParams) {
  await getApi();
  const account = await getAdAccount();

  const ctaType = mapCtaType(params.cta);
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
        call_to_action: { type: ctaType, value: { link: params.linkUrl } },
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
        call_to_action: { type: ctaType, value: { link: params.linkUrl } },
        ...(params.imageHash ? { image_hash: params.imageHash } : {}),
      },
    };
  }

  const payload = {
    name: params.name,
    object_story_spec: objectStorySpec,
  };
  console.log("[adlab-meta] Ad creative create payload:", JSON.stringify(payload, null, 2));

  const creative = await account.createAdCreative([], payload);

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

  const payload = {
    name: params.name,
    adset_id: params.adsetId,
    creative: { creative_id: params.creativeId },
    status: "PAUSED",
  };
  console.log("[adlab-meta] Ad create payload:", JSON.stringify(payload, null, 2));

  const ad = await account.createAd([], payload);

  return ad.id;
}

export async function setStatus(objectId: string, type: "campaign" | "adset" | "ad", status: "ACTIVE" | "PAUSED") {
  const bizSdk = await getBizSdk();
  await getApi();

  if (type === "campaign") {
    const campaign = new bizSdk.Campaign(objectId);
    await campaign.update([], { status });
  } else if (type === "adset") {
    const adset = new bizSdk.AdSet(objectId);
    await adset.update([], { status });
  } else {
    const ad = new bizSdk.Ad(objectId);
    await ad.update([], { status });
  }
}

export async function updateAdSetBudget(adsetId: string, dailyBudgetCents: number) {
  const bizSdk = await getBizSdk();
  await getApi();
  const adset = new bizSdk.AdSet(adsetId);
  await adset.update([], { daily_budget: dailyBudgetCents });
}

export async function deleteCampaign(campaignId: string) {
  const bizSdk = await getBizSdk();
  await getApi();
  const campaign = new bizSdk.Campaign(campaignId);
  await campaign.delete([]);
}

export async function getAdInsights(adId: string, since: string, until: string) {
  const bizSdk = await getBizSdk();
  await getApi();
  const ad = new bizSdk.Ad(adId);

  const insights = await ad.getInsights(
    ["impressions", "clicks", "ctr", "spend", "actions", "frequency", "cpc"],
    {
      time_range: { since, until },
      level: "ad",
    }
  );

  return insights;
}
