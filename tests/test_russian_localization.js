"use strict";

const assert = require("assert");
const {
  RU_HOST,
  normalizeHost,
  isRussianHost,
  isLocalizablePath,
  translateChunk,
  rewriteInternalAnchorHost,
  rewriteCanonicalTag,
  rewriteOgUrlTag,
  localizeRussianHtml,
} = require("../website_russian_localization");

assert.strictEqual(RU_HOST, "ru.vixale.com");
assert.strictEqual(normalizeHost("RU.VIXALE.COM:443"), "ru.vixale.com");
assert.strictEqual(isRussianHost("ru.vixale.com"), true);
assert.strictEqual(isRussianHost("www.vixale.com"), false);
assert.strictEqual(isLocalizablePath("/"), true);
assert.strictEqual(isLocalizablePath("/trading-systems/day-trading"), true);
assert.strictEqual(isLocalizablePath("/dashboard"), true);
assert.strictEqual(isLocalizablePath("/admin/live"), false);
assert.strictEqual(isLocalizablePath("/api/swing-leaders"), false);
assert.strictEqual(isLocalizablePath("/ib/status"), false);

assert.strictEqual(translateChunk("Request Free Access"), "Запросить бесплатный доступ");
assert.strictEqual(translateChunk("Open Positions"), "Открытые позиции");
assert.strictEqual(translateChunk("Viewer adds"), "Дополнительно с доступом для просмотра");
assert.strictEqual(translateChunk("Vixale Prime"), "Vixale Prime");

const packageJson = require("../package.json");
assert.ok(
  packageJson.scripts.start.startsWith("node -r ./website_russian_localization.js "),
  "Russian localization must preload first so it translates the final refined HTML"
);

assert.strictEqual(translateChunk("Trading signals. Three systems. Your choice."), "Торговые сигналы. Три системы. Выбор за вами.");
assert.strictEqual(translateChunk("See the performance. Then watch the system live."), "Сначала изучите результаты. Затем наблюдайте за системой в реальном времени.");
assert.strictEqual(translateChunk("Position size first. Signals second."), "Сначала размер позиции. Затем сигнал.");
assert.strictEqual(translateChunk("I want my own trading bot"), "Хочу собственного торгового бота");
assert.strictEqual(translateChunk("Review the Options record before opening the viewer."), "Изучите историю результатов по опционам, прежде чем открывать защищённый раздел просмотра.");

// Regression: an untranslated source node must stay intact instead of being
// partially translated into a Russian/English hybrid.
const unknownMixedRisk = "This unknown sentence mentions Open Positions but has no approved translation.";
assert.strictEqual(translateChunk(unknownMixedRisk), unknownMixedRisk);

const swingIntro = "A public research/model portfolio built around Vixale's proprietary ranking system.";
const swingReview = "Review open positions, potential candidates, completed trades and model equity history from the latest published update.";
assert.strictEqual(
  translateChunk(swingIntro),
  "Публичный исследовательский модельный портфель, основанный на собственной системе ранжирования Vixale."
);
assert.strictEqual(
  translateChunk(swingReview),
  "В последнем опубликованном обновлении можно просмотреть открытые позиции, потенциальных кандидатов, завершённые сделки и динамику капитала модельного портфеля."
);
assert.doesNotMatch(translateChunk(swingIntro), /built around|research\/model portfolio/i);
assert.doesNotMatch(translateChunk(swingReview), /Review|open positions|potential candidates|completed trades|model equity history/i);

// Regression: only user navigation and SEO URLs move to the RU host. CSS,
// images and other assets must keep the exact canonical asset URL so EN/RU
// render through the same visual resources.
assert.strictEqual(
  rewriteInternalAnchorHost('<a href="https://www.vixale.com/results">Results</a>'),
  '<a href="https://ru.vixale.com/results">Results</a>'
);
assert.strictEqual(
  rewriteInternalAnchorHost('<link rel="stylesheet" href="https://www.vixale.com/assets/site.css">'),
  '<link rel="stylesheet" href="https://www.vixale.com/assets/site.css">'
);
assert.strictEqual(
  rewriteCanonicalTag('<link rel="canonical" href="https://www.vixale.com/results">'),
  '<link rel="canonical" href="https://ru.vixale.com/results">'
);
assert.strictEqual(
  rewriteOgUrlTag('<meta property="og:url" content="https://www.vixale.com/results">'),
  '<meta property="og:url" content="https://ru.vixale.com/results">'
);

const html = `<!doctype html>
<html lang="en">
<head>
  <title>Vixale | Trading Systems, Results & Free Viewer Access</title>
  <meta name="description" content="Compare Vixale Day Trading, Swing Trading, and Options, inspect available evidence, and request free read-only viewer access.">
  <link rel="canonical" href="https://www.vixale.com/">
  <meta property="og:url" content="https://www.vixale.com/">
  <link rel="stylesheet" href="https://www.vixale.com/assets/site.css">
  <style>.hero{background-image:url(https://www.vixale.com/assets/hero.svg)}.label:after{content:"Results"}</style>
</head>
<body class="site-home">
  <a class="vx-skip-link" href="#main-content">Skip to content</a>
  <nav>
    <a id="results-nav" class="nav-link" data-route="results" href="https://www.vixale.com/results">Results</a>
    <a href="/trading-systems">Trading Systems</a>
    <a href="/services">Services</a>
    <a href="/login">Log In</a>
    <a href="/access">Request Free Access</a>
  </nav>
  <main id="main-content">
    <h1>See how our trading systems perform before you commit.</h1>
    <p>Vixale does not trade or manage customer brokerage accounts.</p>
    <p>${swingIntro}</p>
    <p>${swingReview}</p>
    <p>${unknownMixedRisk}</p>
    <div>Open Positions</div>
    <img src="https://www.vixale.com/assets/logo.svg" alt="Vixale Prime">
    <input name="name" placeholder="Your name" aria-label="Your name">
    <input type="hidden" name="source" value="Access page · Day Trading">
  </main>
  <script>const status = "Results"; const url = "https://www.vixale.com/api/test";</script>
</body>
</html>`;

const localized = localizeRussianHtml(html, "/");
assert.match(localized, /<html lang="ru">/);
assert.match(localized, /Vixale \| Торговые системы, результаты и бесплатный доступ/);
assert.match(localized, /Сравните дейтрейдинг, свинг-трейдинг и опционы Vixale/);
assert.match(localized, /rel="canonical" href="https:\/\/ru\.vixale\.com\/"/);
assert.match(localized, /property="og:url" content="https:\/\/ru\.vixale\.com\/"/);
assert.match(localized, /hreflang="en" href="https:\/\/www\.vixale\.com\/"/);
assert.match(localized, /hreflang="ru" href="https:\/\/ru\.vixale\.com\/"/);
assert.match(localized, /id="results-nav" class="nav-link" data-route="results" href="https:\/\/ru\.vixale\.com\/results">Результаты<\/a>/);
assert.match(localized, />Торговые системы</);
assert.match(localized, />Услуги</);
assert.match(localized, />Войти</);
assert.match(localized, />Запросить бесплатный доступ</);
assert.match(localized, /Посмотрите, как работают наши торговые системы, прежде чем принимать решение\./);
assert.match(localized, /Vixale не совершает сделки и не управляет брокерскими счетами клиентов\./);
assert.match(localized, /Публичный исследовательский модельный портфель/);
assert.match(localized, /В последнем опубликованном обновлении можно просмотреть открытые позиции/);
assert.match(localized, />Открытые позиции</);
assert.match(localized, /placeholder="Ваше имя"/);
assert.match(localized, /aria-label="Ваше имя"/);
assert.match(localized, /value="Access page · Day Trading"/); // backend value must not change
assert.match(localized, /rel="stylesheet" href="https:\/\/www\.vixale\.com\/assets\/site\.css"/); // asset host untouched
assert.match(localized, /src="https:\/\/www\.vixale\.com\/assets\/logo\.svg"/); // asset host untouched
assert.match(localized, /<style>\.hero\{background-image:url\(https:\/\/www\.vixale\.com\/assets\/hero\.svg\)\}\.label:after\{content:"Results"\}<\/style>/); // CSS untouched
assert.match(localized, /<script>const status = "Results"; const url = "https:\/\/www\.vixale\.com\/api\/test";<\/script>/); // JS untouched
assert.match(localized, new RegExp(unknownMixedRisk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); // no partial translation

const secondPass = localizeRussianHtml(localized, "/");
assert.strictEqual(secondPass, localized, "localization must be idempotent");

console.log("Russian localization regression checks: PASS");

// Host scoping: the middleware must not alter English-host responses and must
// localize Russian-host HTML responses without changing JSON/API behavior.
const { installRussianLocalization } = require("../website_russian_localization");
let middleware;
installRussianLocalization({ use(fn) { middleware = fn; } });
assert.strictEqual(typeof middleware, "function");

function runMiddleware(host, path, body, contentType = "text/html; charset=utf-8", method = "GET") {
  let sent;
  const req = {
    method,
    originalUrl: path,
    url: path,
    headers: { host },
    get(name) { return String(name).toLowerCase() === "host" ? host : undefined; },
  };
  const res = {
    headers: { "Content-Type": contentType },
    getHeader(name) { return this.headers[name]; },
    send(value) { sent = value; return value; },
  };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  res.send(body);
  return sent;
}

const hostSample = '<!doctype html><html lang="en"><body><h1>Trading Systems</h1><button>Request Free Access</button></body></html>';
assert.strictEqual(runMiddleware("www.vixale.com", "/", hostSample), hostSample);
assert.match(runMiddleware("ru.vixale.com", "/", hostSample), /Торговые системы/);
assert.match(runMiddleware("ru.vixale.com", "/access", hostSample, "text/html", "POST"), /Запросить бесплатный доступ/);
assert.strictEqual(runMiddleware("ru.vixale.com", "/api/status", '{"label":"Results"}', "application/json"), '{"label":"Results"}');
assert.strictEqual(runMiddleware("ru.vixale.com", "/admin/live", hostSample), hostSample);

console.log("Russian localization host-scope checks: PASS");
