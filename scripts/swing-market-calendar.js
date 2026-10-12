"use strict";
// Published NYSE cash-equity calendar: https://www.nyse.com/trade/hours-calendars
const holidays = {
  2026: "01-01 01-19 02-16 04-03 05-25 06-19 07-03 09-07 11-26 12-25",
  2027: "01-01 01-18 02-15 03-26 05-31 06-18 07-05 09-06 11-25 12-24",
  2028: "01-17 02-21 04-14 05-29 06-19 07-04 09-04 11-23 12-25",
};
const early = new Set(["2026-11-27","2026-12-24","2027-11-26","2028-07-03","2028-11-24"]);
function session(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid session date");
  const year = date.slice(0,4);
  if (!holidays[year]) throw new Error("NYSE calendar needs maintenance for " + year);
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const closed = weekday === 0 || weekday === 6 || holidays[year].split(" ").includes(date.slice(5));
  return { date, open: !closed, closeEt: closed ? null : early.has(date) ? "13:00" : "16:00" };
}
function previousSession(date) {
  let d = new Date(date + "T12:00:00Z");
  for (let i=0;i<10;i++) { d.setUTCDate(d.getUTCDate()-1); const value=d.toISOString().slice(0,10); if(session(value).open) return value; }
  throw new Error("No previous exchange session");
}
module.exports = { session, previousSession };
if (require.main === module) console.log(JSON.stringify(session(process.argv[2])));

