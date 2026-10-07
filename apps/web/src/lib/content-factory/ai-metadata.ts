/**
 * AI-content disclosure metadata (2026-10-06, per Keenan: "make sure the ai
 * content portion is turned on for everything meta, facebook, and youtube as
 * well across the board so there's no discrepancies").
 *
 * Instagram and YouTube take an API flag (is_ai_generated /
 * containsSyntheticMedia). Facebook Page photos, videos and reels have no
 * such flag, so Meta's "AI info" label there comes from the file itself: the
 * IPTC DigitalSourceType "trainedAlgorithmicMedia" in an XMP packet. Our
 * sharp/ffmpeg renders strip all metadata, so the Facebook publisher tags the
 * bytes here and uploads them directly instead of handing Meta a URL.
 *
 * Both taggers splice the packet in without re-encoding a single pixel or
 * frame.
 */

const DIGITAL_SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export const AI_XMP = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    Iptc4xmpExt:DigitalSourceType="${DIGITAL_SOURCE_TYPE}"
    xmp:CreatorTool="AI image/video generator"/>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

const XMP_NS = Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1");
// Registered UUID of the XMP box in ISO base media files (MP4/MOV).
const XMP_UUID = Buffer.from("BE7ACFCB97A942E89C71999491E3AFAC", "hex");

/** Insert an XMP APP1 segment right after the JPEG SOI marker. Non-JPEGs pass through. */
export function tagJpegAi(jpeg: Buffer): Buffer {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  if (jpeg.includes(Buffer.from("trainedAlgorithmicMedia"))) return jpeg;
  const payload = Buffer.concat([XMP_NS, Buffer.from(AI_XMP, "utf8")]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, payload, jpeg.subarray(2)]);
}

/**
 * Append a top-level XMP uuid box to an MP4. Boxes are sequential and the
 * new one sits after every existing box, so no offsets (moov/stco) move.
 */
export function tagMp4Ai(mp4: Buffer): Buffer {
  if (mp4.length < 12 || mp4.subarray(4, 8).toString("latin1") !== "ftyp") return mp4;
  if (mp4.includes(Buffer.from("trainedAlgorithmicMedia"))) return mp4;
  const xmp = Buffer.from(AI_XMP, "utf8");
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + XMP_UUID.length + xmp.length);
  header.write("uuid", 4, "latin1");
  return Buffer.concat([mp4, header, XMP_UUID, xmp]);
}

/** Download a published asset and return it tagged (by URL path: .mp4 → MP4, else JPEG). */
export async function fetchTaggedAiMedia(url: string): Promise<{ buf: Buffer; contentType: string; filename: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`fetch ${url} failed (${res.status})`);
  const raw = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") ?? "";
  if (/\.mp4(\?|$)/i.test(url) || type.startsWith("video/")) {
    return { buf: tagMp4Ai(raw), contentType: "video/mp4", filename: "video.mp4" };
  }
  if (raw[0] === 0xff && raw[1] === 0xd8) return { buf: tagJpegAi(raw), contentType: "image/jpeg", filename: "image.jpg" };
  return { buf: raw, contentType: type || "application/octet-stream", filename: type.includes("png") ? "image.png" : "image" };
}
