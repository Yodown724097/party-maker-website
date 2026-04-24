/**
 * Party Maker 产品展示 PPT 生成器 v2
 * 16:9 宽屏，contain 模式不变形，自动循环播放
 */
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const localImgs = JSON.parse(fs.readFileSync("local_imgs.json", "utf8"));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const imgs = shuffle(localImgs);

const BG_DARK  = "1A1A2E";
const BG_LIGHT = "FFF8F0";
const ACCENT   = "E8A045";
const ACCENT2  = "C0392B";
const TEXT_MID = "555577";
const WHITE    = "FFFFFF";
const GOLD     = "D4A017";

// PPT尺寸 16:9 = 10 x 5.625 英寸
const SLIDE_W = 10;
const SLIDE_H = 5.625;

// contain模式：图片放入指定区域，不变形，居中
function containLayout(img, areaX, areaY, areaW, areaH) {
  const imgR = img.w / img.h;
  const areaR = areaW / areaH;
  let drawW, drawH, drawX, drawY;
  if (imgR > areaR) {
    drawW = areaW;
    drawH = areaW / imgR;
    drawX = areaX;
    drawY = areaY + (areaH - drawH) / 2;
  } else {
    drawH = areaH;
    drawW = areaH * imgR;
    drawX = areaX + (areaW - drawW) / 2;
    drawY = areaY;
  }
  return {
    path: path.resolve(__dirname, img.local),
    x: drawX, y: drawY, w: drawW, h: drawH,
  };
}

// ===== 布局函数 =====

function layoutCover(slide, imgList) {
  slide.background = { color: BG_DARK };
  const area = { x: 5.0, y: 0, w: 5.0, h: 5.625 };
  const p = containLayout(imgList[0], area.x, area.y, area.w, area.h);
  slide.addImage(p);
  // 暗遮罩
  slide.addShape("rect", { x: 5.0, y: 0, w: 5.0, h: 5.625, fill: { color: "1A1A2E", transparency: 40 } });
  // 金色竖线
  slide.addShape("rect", { x: 4.85, y: 0.3, w: 0.06, h: 5.0, fill: { color: ACCENT } });
  // 左侧品牌
  slide.addText("PARTY MAKER", {
    x: 0.4, y: 1.0, w: 4.2, h: 0.85,
    fontSize: 38, bold: true, color: ACCENT, fontFace: "Arial Black", align: "left", margin: 0,
  });
  slide.addText("派对一站式采购", {
    x: 0.4, y: 1.9, w: 4.2, h: 0.55,
    fontSize: 20, color: WHITE, align: "left", margin: 0,
  });
  slide.addText("Ramadan · Eid · Party Supplies", {
    x: 0.4, y: 2.5, w: 4.2, h: 0.45,
    fontSize: 13, color: "CCBBAA", italic: true, align: "left", margin: 0,
  });
  // 网址醒目
  slide.addShape("rect", { x: 0.4, y: 3.4, w: 4.0, h: 0.75, fill: { color: ACCENT } });
  slide.addText("WWW.PARTYMAKER.CN", {
    x: 0.4, y: 3.4, w: 4.0, h: 0.75,
    fontSize: 18, bold: true, color: WHITE, fontFace: "Arial Black", align: "center", valign: "middle", margin: 0,
  });
}

function layout3H(slide, imgList) {
  slide.background = { color: BG_LIGHT };
  const W = 2.9, GAP = 0.2, H = 3.6, TOP = 0.9;
  for (let i = 0; i < 3; i++) {
    const X = 0.25 + i * (W + GAP);
    // 卡片背景
    slide.addShape("rect", {
      x: X - 0.06, y: TOP - 0.06, w: W + 0.12, h: H + 0.5,
      fill: { color: WHITE }, line: { color: "DDDDDD", width: 1 },
      shadow: { type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.10 },
    });
    const p = containLayout(imgList[i], X, TOP, W, H - 0.4);
    slide.addImage(p);
    const name = (imgList[i].name || "").slice(0, 28);
    slide.addText(name, { x: X, y: TOP + H - 0.35, w: W, h: 0.35, fontSize: 8, color: TEXT_MID, align: "center", margin: 0 });
  }
  slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.75, fill: { color: BG_DARK } });
  slide.addText("PARTY MAKER  |  Product Showcase", { x: 0.4, y: 0, w: 7, h: 0.75, fontSize: 16, bold: true, color: WHITE, valign: "middle", margin: 0 });
  slide.addText("WWW.PARTYMAKER.CN", { x: 7, y: 0, w: 2.8, h: 0.75, fontSize: 13, bold: true, color: ACCENT, align: "right", valign: "middle", margin: 0 });
}

function layoutBigLeft(slide, imgList) {
  slide.background = { color: "F5F0FF" };
  slide.addImage(containLayout(imgList[0], 0.3, 0.85, 4.6, 4.0));
  slide.addImage(containLayout(imgList[1], 5.3, 0.85, 4.4, 1.85));
  slide.addImage(containLayout(imgList[2], 5.3, 2.95, 4.4, 1.9));
  slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.75, fill: { color: ACCENT2 } });
  slide.addText("Ramadan & Eid Collection", { x: 0.4, y: 0, w: 6, h: 0.75, fontSize: 17, bold: true, color: WHITE, valign: "middle", margin: 0 });
  slide.addText("WWW.PARTYMAKER.CN", { x: 6.5, y: 0, w: 3.3, h: 0.75, fontSize: 13, bold: true, color: WHITE, align: "right", valign: "middle", margin: 0 });
}

function layout2x2(slide, imgList) {
  slide.background = { color: "0D0D2B" };
  const positions = [
    { x: 0.2, y: 0.75 }, { x: 5.1, y: 0.75 },
    { x: 0.2, y: 3.05 }, { x: 5.1, y: 3.05 },
  ];
  const W = 4.6, H = 2.15;
  for (let i = 0; i < 4; i++) {
    const p = positions[i];
    slide.addImage(containLayout(imgList[i], p.x, p.y, W, H));
    slide.addShape("rect", { x: p.x, y: p.y + H - 0.45, w: W, h: 0.45, fill: { color: "000000", transparency: 40 } });
    slide.addText((imgList[i].name || "").slice(0, 25), { x: p.x + 0.1, y: p.y + H - 0.42, w: W - 0.2, h: 0.38, fontSize: 8, color: WHITE, align: "left", valign: "middle", margin: 0 });
  }
  slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.68, fill: { color: BG_DARK } });
  slide.addText("NEW ARRIVALS", { x: 0.4, y: 0, w: 6, h: 0.68, fontSize: 16, bold: true, color: ACCENT, valign: "middle", margin: 0 });
  slide.addText("WWW.PARTYMAKER.CN", { x: 6.5, y: 0, w: 3.3, h: 0.68, fontSize: 12, bold: true, color: "CCBBAA", align: "right", valign: "middle", margin: 0 });
}

function layoutFullScreen(slide, imgList) {
  slide.background = { color: BG_DARK };
  slide.addImage(containLayout(imgList[0], 0, 0, SLIDE_W, SLIDE_H));
  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: "000000", transparency: 45 } });
  slide.addText("WWW.PARTYMAKER.CN", {
    x: 0.5, y: 2.1, w: 9, h: 1.0,
    fontSize: 42, bold: true, color: WHITE, fontFace: "Arial Black", align: "center", valign: "middle", margin: 0,
  });
  slide.addText("Your Trusted Party Supplies Partner", {
    x: 1, y: 3.2, w: 8, h: 0.55,
    fontSize: 17, color: ACCENT, italic: true, align: "center", margin: 0,
  });
}

function layoutBigRight(slide, imgList) {
  slide.background = { color: "FFF5E6" };
  slide.addImage(containLayout(imgList[0], 5.0, 0.85, 4.7, 4.0));
  slide.addImage(containLayout(imgList[1], 0.3, 0.85, 4.3, 1.85));
  slide.addImage(containLayout(imgList[2], 0.3, 2.95, 4.3, 1.9));
  slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.75, fill: { color: GOLD } });
  slide.addText("Party Maker Collections", { x: 0.4, y: 0, w: 6, h: 0.75, fontSize: 17, bold: true, color: BG_DARK, valign: "middle", margin: 0 });
  slide.addText("WWW.PARTYMAKER.CN", { x: 6.5, y: 0, w: 3.3, h: 0.75, fontSize: 13, bold: true, color: "7A4800", align: "right", valign: "middle", margin: 0 });
}

function layoutMagazine(slide, imgList) {
  slide.background = { color: "EEF2FF" };
  slide.addShape("rect", { x: 0, y: 0, w: 3.2, h: 5.625, fill: { color: "1A1A2E" } });
  slide.addText("PARTY\nMAKER", { x: 0.2, y: 0.8, w: 2.7, h: 1.8, fontSize: 28, bold: true, color: ACCENT, fontFace: "Arial Black", align: "center", valign: "top", margin: 0 });
  slide.addText("Wholesale\nSupplier", { x: 0.2, y: 2.7, w: 2.7, h: 0.9, fontSize: 14, color: WHITE, align: "center", margin: 0 });
  slide.addShape("rect", { x: 0.2, y: 3.75, w: 2.7, h: 0.55, fill: { color: ACCENT } });
  slide.addText("WWW.PARTYMAKER.CN", { x: 0.2, y: 3.75, w: 2.7, h: 0.55, fontSize: 9, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
  const ys = [0.1, 2.0, 3.9], Hs = [1.75, 1.75, 1.55];
  for (let i = 0; i < 3; i++) {
    slide.addImage(containLayout(imgList[i], 3.5, ys[i], 6.2, Hs[i]));
  }
}

function layoutCenter(slide, imgList) {
  slide.background = { color: BG_DARK };
  slide.addImage(containLayout(imgList[0], 2.8, 0.5, 4.3, 4.3));
  slide.addImage(containLayout(imgList[1], 0.15, 1.3, 2.4, 2.4));
  slide.addImage(containLayout(imgList[2], 7.45, 1.3, 2.4, 2.4));
  slide.addShape("rect", { x: 0, y: 5.08, w: 10, h: 0.55, fill: { color: ACCENT } });
  slide.addText("WWW.PARTYMAKER.CN  ·  派对用品批发首选", { x: 0, y: 5.08, w: 10, h: 0.55, fontSize: 15, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
}

function layoutStripes(slide, imgList) {
  slide.background = { color: "222233" };
  const H = 1.72;
  const ys = [0.12, 1.93, 3.74];
  const labels = ["Decoration", "Party Sets", "Ramadan Special"];
  for (let i = 0; i < 3; i++) {
    slide.addImage(containLayout(imgList[i], 0, ys[i], SLIDE_W, H));
    slide.addShape("rect", { x: 0, y: ys[i], w: 2.5, h: H, fill: { color: "000000", transparency: 35 } });
    slide.addText(labels[i], { x: 0.1, y: ys[i], w: 2.3, h: H, fontSize: 14, bold: true, color: ACCENT, valign: "middle", margin: 0 });
  }
  slide.addShape("rect", { x: 9.0, y: 0, w: 1.0, h: 5.625, fill: { color: BG_DARK, transparency: 20 } });
  slide.addText("WWW.PARTYMAKER.CN", { x: 8.9, y: 0.5, w: 1.0, h: 4.5, fontSize: 9, color: WHITE, rotate: 270, align: "center", margin: 0 });
}

function layoutCTA(slide, imgList) {
  slide.background = { color: BG_DARK };
  slide.addImage(containLayout(imgList[0], 0, 0, SLIDE_W, SLIDE_H));
  // 遮罩
  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: "000000", transparency: 30 } });
  // 中央信息框
  slide.addShape("rect", { x: 1.0, y: 1.3, w: 8.0, h: 3.1, fill: { color: "000000", transparency: 35 }, line: { color: ACCENT, width: 2 } });
  slide.addText("联系我们", { x: 1.0, y: 1.4, w: 8.0, h: 0.65, fontSize: 18, color: ACCENT, align: "center", bold: true, margin: 0 });
  slide.addText("WWW.PARTYMAKER.CN", { x: 1.0, y: 2.1, w: 8.0, h: 1.0, fontSize: 40, bold: true, color: WHITE, fontFace: "Arial Black", align: "center", valign: "middle", margin: 0 });
  slide.addText("Ramadan · Eid · Birthday · Wedding Party Supplies", { x: 1.0, y: 3.2, w: 8.0, h: 0.5, fontSize: 13, color: "DDCCAA", italic: true, align: "center", margin: 0 });
  slide.addText("一站式派对用品批发商  |  全球配送", { x: 1.0, y: 3.8, w: 8.0, h: 0.45, fontSize: 12, color: "AABBCC", align: "center", margin: 0 });
}

// ===== 生成 =====
const layoutFns = [layoutCover, layout3H, layoutBigLeft, layout2x2, layoutFullScreen, layoutBigRight, layoutMagazine, layoutCenter, layoutStripes, layoutCTA];
const imgNeeds = [1, 3, 3, 4, 1, 3, 3, 3, 3, 1];

let pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Party Maker";
pres.title = "Party Maker - Product Showcase";

let cursor = 0;
for (let i = 0; i < 10; i++) {
  const need = imgNeeds[i];
  const chunk = [];
  for (let j = 0; j < need; j++) {
    chunk.push(imgs[(cursor + j) % imgs.length]);
  }
  cursor += need;
  const slide = pres.addSlide();
  slide.slideNumber = null;
  slide.transition = { type: "fade", advanceOnTime: true, advanceAfterTime: 5000 };
  layoutFns[i](slide, chunk);
}

const outPath = path.join(__dirname, "PartyMaker_Showcase.pptx");
pres.writeFile({ fileName: outPath }).then(() => {
  console.log("OK: " + outPath);
}).catch(e => {
  console.error("ERROR:", e.message);
});
