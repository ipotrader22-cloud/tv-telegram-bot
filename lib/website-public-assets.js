"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function asset(name, content, type) {
  const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  return { url: "/assets/" + name.replace(/\./, "." + hash + "."), content, type };
}

const assets = ["css", "js"].map(ext => {
  const name = "vixale-public." + ext;
  return asset(name, fs.readFileSync(path.join(__dirname, "..", "public", name)),
    ext === "css" ? "text/css" : "application/javascript");
});

function installAsset(app, { url, content, type }) {
  app.get(url, (req, res) => res
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .type(type).send(content));
}

const resultsAsset = asset("vixale-results.js", fs.readFileSync(path.join(__dirname, "..", "public", "vixale-results.js")), "application/javascript");
assets.push(resultsAsset);

const publicTags = '<link rel="stylesheet" href="' + assets[0].url + '">' +
  '<script defer src="' + assets[1].url + '"></script>';

module.exports = { asset, assets, installAsset, publicTags, resultsAsset };
