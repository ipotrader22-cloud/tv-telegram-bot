"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const start = String(pkg.scripts && pkg.scripts.start || "");
const websitePreloads = [...start.matchAll(/-r \.\/(website_[^ ]+\.js)/g)].map(match => match[1]);

assert(!start.includes("-r ./website_about_copy_polish.js"), "About copy polish must no longer be a separate preload");
assert(start.includes("-r ./website_about_refinement.js"), "About refinement remains the single About preload entrypoint");
assert.strictEqual(websitePreloads.length, 22, "first consolidation stage should reduce website preload count from 23 to 22");

const aboutSource = fs.readFileSync(path.join(root, "website_about_refinement.js"), "utf8");
const dependencyNeedle = 'require("./website_about_copy_polish");';
assert(aboutSource.includes(dependencyNeedle), "About refinement must explicitly compose copy polish");
assert(aboutSource.indexOf(dependencyNeedle) < aboutSource.indexOf("const originalLoad = Module._load;"), "copy polish must install before the About refinement wrapper captures Module._load");

const { STYLE_ID: COPY_STYLE_ID, FOUNDER_SENTENCE } = require("../website_about_copy_polish");
const { STYLE_ID: ABOUT_STYLE_ID } = require("../website_about_refinement");
const express = require("express");

const baseHtml = `<!doctype html><html><head><title>Base</title><link rel="canonical" href="https://www.vixale.com/"><meta name="description" content="Base"></head><body><nav><div class="nav-links"><a href="/services">Services</a></div></nav><main><section>Base</section></main></body></html>`;
const app = express();
app.get("/", (_req, res) => res.type("html").send(baseHtml));

const server = app.listen(0, "127.0.0.1", async () => {
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/about`);
    const html = await response.text();
    assert.strictEqual(response.status, 200);
    assert(html.includes("Vixale | About"));
    assert(html.includes(`id="${ABOUT_STYLE_ID}"`), "About refinement style must remain present");
    assert(html.includes(`id="${COPY_STYLE_ID}"`), "About copy-polish style must remain present through composed preload");
    assert(!html.includes(FOUNDER_SENTENCE), "founder sentence removal must remain unchanged");
    assert(html.includes('href="https://www.vixale.com/about"'), "About canonical must remain unchanged");
    console.log("Issue #89 About preload consolidation: PASS");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
