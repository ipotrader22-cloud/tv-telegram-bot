"use strict";

const assert = require("assert");
const Module = require("module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "googleapis") return { google: {} };
  return originalLoad.call(this, request, parent, isMain);
};

const blog = require("../website_daily_trading_summary.js");

const source = {
  tradesValues: [
    ["timestamp","symbol","side","event","entry","size","target","stop","result","status"],
    ["2026-10-05 09:56:05","IWM","SHORT","FILL","280.35","71","280.01","282.27","","open"],
    ["2026-10-05 15:45:00","TSLA","LONG","FILL","450","10","460","440","","open"],
    ["2026-10-04 11:00:00","OLD","LONG","FILL","10","1","11","9","","open"]
  ],
  closedValues: [
    ["trade_id","open_time","close_time","symbol","side","entry","exit","size","result","exit_reason"],
    ["IWM_SHORT","2026-10-05 09:56:05","2026-10-05 10:20:15","IWM","SHORT","280.38","282.59","71","-159.04","FLIP_CLOSE"],
    ["NVDA_LONG","2026-10-02 09:49:47","2026-10-05 14:27:43","NVDA","LONG","236.71","238.53","84","152.88","TP"],
    ["OLD_LONG","2026-10-04 11:00:00","2026-10-04 14:00:00","OLD","LONG","10","11","1","1","TP"]
  ],
  metadataValues: [
    ["Metadata ID","Trade ID","System","Symbol","Side","Open Time","Close Time","Event"],
    ["m1","IWM_SHORT","Vixale Edge","IWM","SHORT","2026-10-05 09:56:05","2026-10-05 10:20:15","FLIP_CLOSE"],
    ["m2","NVDA_LONG","Vixale Edge","NVDA","LONG","2026-10-02 09:49:47","2026-10-05 14:27:43","TP"]
  ],
  optionValues: [
    ["ID","Trade Date","Entry Time","Symbol","Strategy","Legs","Expiration","Contracts","Multiplier","Trade Type","Entry Price","Exit Date","Exit Time","Exit Price","Fees","Status","Notes"],
    ["closed-id","2026-10-04","10:00","SPX","Calendar","Long / Short","2026-10-08","2","100","Debit","18.2","2026-10-05","13:26","22.2","10","Closed","private note"],
    ["open-id","2026-10-05","15:55","SPY","Straddle","Short Call / Short Put","2026-10-06","1","100","Credit","5.5","","","","Open","private open note"]
  ]
};

const summary = blog.buildDaySummary(source, "2026-10-05");
assert.strictEqual(summary.totals.opened_count, 2);
assert.strictEqual(summary.totals.closed_count, 2);
assert.strictEqual(summary.totals.winners, 1);
assert.strictEqual(summary.totals.losers, 1);
assert.strictEqual(summary.totals.realized_pnl, -6.16);
assert.strictEqual(summary.totals.same_day_closed_count, 1);
assert.strictEqual(summary.totals.carried_closed_count, 1);
assert.strictEqual(summary.totals.options_closed_count, 1);
assert.strictEqual(summary.closed[0].system, "Vixale Edge");
assert.strictEqual(summary.closed[1].carried, true);
assert.deepStrictEqual(blog.availableDates(source), ["2026-10-05", "2026-10-04"]);
assert.strictEqual(summary.options[0].result, -810);

const historySource = {
  tradesValues: [["timestamp","symbol","side","event","entry","size","target","stop","result","status"]],
  closedValues: [["trade_id","open_time","close_time","symbol","side","entry","exit","size","result","exit_reason"]],
  metadataValues: [["Metadata ID","Trade ID","System","Symbol","Side","Open Time","Close Time","Event"]],
  optionValues: [["ID","Trade Date","Entry Time","Symbol","Strategy","Legs","Expiration","Contracts","Multiplier","Trade Type","Entry Price","Exit Date","Exit Time","Exit Price","Fees","Status","Notes"]]
};
for (let i = 0; i < 60; i += 1) {
  const dt = new Date(Date.UTC(2026, 9, 5 + i));
  const date = dt.toISOString().slice(0, 10);
  historySource.tradesValues.push([date + " 10:00:00","T" + i,"LONG","FILL","10","1","11","9","","open"]);
}
const historyDates = blog.availableDates(historySource);
assert.strictEqual(historyDates.length, 60);
assert.strictEqual(historyDates[historyDates.length - 1], "2026-10-05");

const earlierHistory = {
  ...historySource,
  tradesValues: [...historySource.tradesValues, ["2026-07-01 10:00:00","EARLY","LONG","FILL","10","1","11","9","","open"]]
};
assert(blog.availableDates(earlierHistory).includes("2026-07-01"));

const html = blog.renderDayPage(summary, false);
assert(html.includes("Vixale Daily Trading Summary"));
assert(html.includes("Copy Link"));
assert(html.includes("Share on LinkedIn"));
assert(html.includes("-$6.16"));
assert(html.includes("IWM"));
assert(html.includes("NVDA"));
assert(!html.includes("TSLA"));
assert(!html.includes("SPY"));
assert(!html.includes("closed-id"));
assert(!html.includes("private note"));
assert(html.includes("closed Option Journal records only"));
assert(html.includes("Result"));
assert(html.includes("-$810.00"));

assert.strictEqual(blog.money(null), "—");
assert.strictEqual(blog.price(null), "—");
assert.strictEqual(blog.validDateKey("2026-02-29"), false);
assert.strictEqual(blog.validDateKey("2028-02-29"), true);

console.log("daily trading summary tests: PASS");
