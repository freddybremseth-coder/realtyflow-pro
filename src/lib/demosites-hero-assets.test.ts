import assert from "node:assert/strict";
import test from "node:test";
import {
  extractHeroAssetsFromHtml,
  isDirectHeroVideoUrl,
  isLikelyTextGraphicCandidate,
  rankHeroCandidates,
} from "./demosites-hero-assets";

test("rejects text-heavy and document-style image candidates", () => {
  assert.equal(isLikelyTextGraphicCandidate({
    url: "https://example.no/uploads/prisliste-2026.png",
    context: "Pris og produktinformasjon",
    source: "page-image",
  }), true);
  assert.equal(isLikelyTextGraphicCandidate({
    url: "https://example.no/images/team-at-work.jpg",
    context: "Våre håndverkere på byggeplass",
    source: "page-image",
  }), false);
});

test("extracts video poster and direct video as the strongest hero candidate", () => {
  const html = `
    <html><head><meta property="og:image" content="/images/social.jpg"></head>
    <body>
      <video poster="/media/roof-project-poster.jpg" autoplay muted>
        <source src="/media/roof-project.mp4" type="video/mp4">
      </video>
      <img src="/images/prisliste.png" alt="Prisliste og tekst">
      <img src="/images/craftsman.jpg" alt="Fagarbeider på tak" width="1600" height="900">
    </body></html>`;
  const result = extractHeroAssetsFromHtml(html, "https://takfirma.no/");
  assert.equal(result.videos[0]?.kind, "direct");
  assert.equal(result.videos[0]?.url, "https://takfirma.no/media/roof-project.mp4");
  assert.equal(result.images[0]?.source, "video-poster");
  assert.equal(result.images.some((image) => image.url.includes("prisliste")), false);
});

test("uses YouTube max-resolution thumbnail but marks the video as a link", () => {
  const result = extractHeroAssetsFromHtml(
    '<iframe src="https://www.youtube.com/embed/abc123XYZ"></iframe>',
    "https://bedrift.no/",
  );
  assert.equal(result.videos[0]?.kind, "link");
  assert.equal(result.images[0]?.url, "https://i.ytimg.com/vi/abc123XYZ/maxresdefault.jpg");
  assert.equal(result.images[0]?.videoKind, "link");
});

test("ranks real hero photography above generic page images", () => {
  const ranked = rankHeroCandidates([
    { url: "https://site.no/img/third.jpg", source: "page-image", score: 55 },
    { url: "https://site.no/img/main-cover.jpg", source: "hero-image", context: "hero cover", score: 90 },
    { url: "https://site.no/img/certificate.jpg", source: "page-image", score: 120 },
  ]);
  assert.equal(ranked[0]?.url, "https://site.no/img/main-cover.jpg");
  assert.equal(ranked.some((item) => item.url.includes("certificate")), false);
});

test("only direct media files qualify for automatic background video", () => {
  assert.equal(isDirectHeroVideoUrl("https://cdn.example.no/showroom.webm"), true);
  assert.equal(isDirectHeroVideoUrl("https://youtube.com/watch?v=abc"), false);
  assert.equal(isDirectHeroVideoUrl("https://player.vimeo.com/video/123"), false);
});
