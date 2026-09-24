import { chromium } from "/Users/reviewwave/Acuity/node_modules/playwright/index.mjs";
import fs from "fs";
const mark = fs.readFileSync("mark.svg","utf8");
const markInner = mark.replace(/^[\s\S]*?<svg[^>]*>/,"").replace(/<\/svg>\s*$/,"");
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800;125,500&display=block" rel="stylesheet">`;
const BG = "#0B0B0C";
const svgMark = (size, rot=0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><g transform="${rot ? "translate(-22 -8) " : ""}rotate(${rot} 256 256)">${markInner}</g></svg>`;
const page = (w,h,body,bg=BG) => `<!doctype html><html><head>${FONT}<style>
html,body{margin:0;width:${w}px;height:${h}px;background:${bg};overflow:hidden}
.wm{font-family:Archivo;font-stretch:125%;font-weight:800;color:#F4F1EA;letter-spacing:.08em;line-height:1;white-space:nowrap}
.sub{font-family:Archivo;font-stretch:125%;font-weight:500;color:#C9A04E;letter-spacing:.42em;text-transform:uppercase;white-space:nowrap}
.grain{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%, #1a1712 0%, ${BG} 60%)}
</style></head><body style="position:relative">${body}</body></html>`;
const center = (inner) => `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column">${inner}</div>`;
const jobs = {
  // Master horizontal lockup (transparent)
  "bwk-logo-horizontal.png": [2400, 700, page(2400,700, center(`<div style="display:flex;align-items:center;gap:60px">${svgMark(520)}<div class="wm" style="font-size:150px">BUILD WITH KEY</div></div>`), "transparent")],
  "bwk-logo-horizontal-on-black.png": [2400, 700, page(2400,700, `<div class="grain"></div>`+center(`<div style="display:flex;align-items:center;gap:60px">${svgMark(520)}<div class="wm" style="font-size:150px">BUILD WITH KEY</div></div>`))],
  // Stacked lockup
  "bwk-logo-stacked-on-black.png": [1600, 1600, page(1600,1600, `<div class="grain"></div>`+center(`${svgMark(760,-45)}<div class="wm" style="font-size:132px;margin-top:10px">BWK</div><div class="sub" style="font-size:38px;margin-top:34px">Build with key</div>`))],
  // Mark only (transparent)
  "bwk-mark.png": [1024, 1024, page(1024,1024, center(svgMark(1024,-45)), "transparent")],
  // Instagram profile: 1080 square, circle-safe (keep art inside the middle ~70%)
  "bwk-instagram-profile-1080.png": [1080, 1080, page(1080,1080, `<div class="grain"></div>`+center(svgMark(760,-45)))],
  // Facebook profile: 720 square minimum; same art
  "bwk-facebook-profile-720.png": [720, 720, page(720,720, `<div class="grain"></div>`+center(svgMark(510,-45)))],
  // Facebook cover: 1640x624 (2x of 820x312). Mobile crops to the center ~1280 wide, so keep content centered.
  "bwk-facebook-cover-1640x624.png": [1640, 624, page(1640,624, `<div class="grain"></div>`+center(`<div style="display:flex;align-items:center;gap:40px">${svgMark(250)}<div class="wm" style="font-size:78px">BUILD WITH KEY</div></div><div class="sub" style="font-size:24px;margin-top:30px">Say it. Track it. Build it.</div>`))],
};
const b = await chromium.launch();
for (const [name,[w,h,html]] of Object.entries(jobs)) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.setContent(html, { waitUntil:"networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: name, omitBackground: html.includes("background:transparent") });
  await p.close(); console.log("wrote", name);
}
await b.close();
