// Real-browser end-to-end test (Selenium + headless Firefox).
//   BASE_URL=http://localhost:3000 FIREFOX_BIN=... GECKODRIVER_PATH=... node tests/e2e/ui.e2e.mjs
// Registers a brand-new user through the UI and walks the whole journey; also captures screenshots
// of the seeded demo trip into docs/screenshots. Everything it creates is deleted at the end.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import pg from "pg";
import { MongoClient } from "mongodb";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = path.resolve("docs/screenshots");
const stamp = Date.now().toString(36);
const EMAIL = `ui.${stamp}@uitest.local`;
const EMAIL2 = `ui2.${stamp}@uitest.local`;
const PASS = "BrowserPass123";
const results = [];

const opts = new firefox.Options().addArguments("-headless", "--width=1366", "--height=900");
if (process.env.FIREFOX_BIN) opts.setBinary(process.env.FIREFOX_BIN);
const service = process.env.GECKODRIVER_PATH ? new firefox.ServiceBuilder(process.env.GECKODRIVER_PATH) : undefined;
const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).setFirefoxService(service).build();
driver.manage().setTimeouts({ implicit: 0, pageLoad: 60000, script: 30000 });

const x = (s) => By.xpath(s);
const q = (s) => JSON.stringify(s);
const wait = (loc, ms = 20000) => driver.wait(until.elementLocated(loc), ms);
const visible = async (loc, ms = 20000) => { const el = await wait(loc, ms); await driver.wait(until.elementIsVisible(el), ms); return el; };
const bodyText = () => driver.findElement(By.css("body")).getText();
const waitText = async (text, ms = 20000) => { await driver.wait(async () => (await bodyText()).includes(text), ms, `text not found: ${text}`); };
const setValue = (el, v) => driver.executeScript(`const el=arguments[0];const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');d.set.call(el,arguments[1]);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));`, el, v);
const field = (label) => x(`//label[normalize-space()=${q(label)}]/following-sibling::*[self::input or self::select or self::textarea][1]`);
const fill = async (label, v) => setValue(await visible(field(label)), v);
const btn = (t) => x(`//button[contains(normalize-space(.), ${q(t)})]`);
const click = async (loc) => { const el = await visible(loc); await driver.executeScript("arguments[0].scrollIntoView({block:'center'})", el); await el.click(); };
const tab = (t) => click(x(`//button[@role='tab'][contains(normalize-space(.), ${q(t)})]`));
const shot = async (name) => { await new Promise((r) => setTimeout(r, 500)); fs.writeFileSync(path.join(SHOTS, `${name}.png`), await driver.takeScreenshot(), "base64"); };
const modalClosed = () => driver.wait(async () => (await driver.findElements(x("//div[@role='dialog']"))).length === 0, 20000, 'dialog did not close');
const goto = (p) => driver.get(BASE + p);

async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("  ✓", name); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log("  ✗", name, "—", e.message.split("\n")[0]); try { await shot(`failure-${results.length}`); } catch {} }
}
/** HTTP errors (>=400) seen by the page's own network requests since the last call. */
async function badRequests() {
  return driver.executeScript(`return performance.getEntriesByType('resource').filter(r=>r.responseStatus>=400 && !r.name.includes('/api/auth/me')).map(r=>r.responseStatus+' '+r.name)`);
}

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let tripUrl = "";

try {
  console.log("Journey A — a brand-new user");
  await step("landing page renders and no longer links to a hard-coded demo trip", async () => {
    await goto("/"); await waitText("Travel without schedule collisions");
    await shot("01-landing");
    const links = await driver.findElements(By.css("a[href='/dashboard/1']"));
    if (links.length) throw new Error("landing still links to a hard-coded demo trip");
  });
  await step("protected page redirects anonymous visitors to login", async () => {
    await goto("/dashboard"); await driver.wait(until.urlContains("/login"), 15000);
  });
  await step("registration form validates and creates the account", async () => {
    await goto("/register");
    await shot("02-register");
    await fill("Full Name", "Browser Tester"); await fill("Email", EMAIL); await fill("Password", "short");
    await click(x("//button[@type='submit']"));
    await driver.sleep(800);
    if (!(await driver.getCurrentUrl()).includes("/register")) throw new Error("weak password was accepted");
    await fill("Password", PASS); await click(x("//button[@type='submit']"));
    await driver.wait(until.urlContains("/dashboard"), 20000);
    await waitText("No trips yet");
    await shot("03-dashboard-empty");
  });
  await step("create a trip from the dashboard", async () => {
    await click(btn("New Trip"));
    await fill("Trip Name", "Goa Beach Week"); await fill("Trip Summary", "Sun, sand and seafood.");
    await fill("Start Date", "2026-12-20"); await fill("End Date", "2026-12-24"); await fill("Primary Destination", "Calangute, Goa");
    await shot("04-create-trip-modal");
    await click(btn("Save & Open"));
    await driver.wait(until.urlMatches(/\/dashboard\/\d+$/), 20000);
    tripUrl = new URL(await driver.getCurrentUrl()).pathname;
    await waitText("Goa Beach Week"); await waitText("Your role: Organizer");
  });
  await step("add a second destination and a transport booking", async () => {
    await tab("Transit");
    await waitText("Calangute, Goa");
    await click(btn("+ Add Destination"));
    await fill("Name", "Panaji"); await fill("Location", "Panaji, Goa"); await fill("Arrival", "2026-12-23"); await fill("Departure", "2026-12-24");
    await click(x("//div[@role='dialog']//button[@type='submit']")); await modalClosed(); await waitText("Panaji, Goa");
    await click(btn("+ Add Transport"));
    await fill("Provider", "Kadamba Bus"); await fill("Departs", "2026-12-23T07:00"); await fill("Arrives", "2026-12-23T09:00"); await fill("Booking ref", "KB-123"); await fill("Cost (INR)", "450");
    await click(x("//div[@role='dialog']//button[@type='submit']")); await modalClosed(); await waitText("Kadamba Bus");
  });
  await step("add a stay (check-in/out) through the form", async () => {
    await click(btn("+ Add Stay"));
    await fill("Name", "Seaside Shack"); await fill("Check-in", "2026-12-20T14:00"); await fill("Check-out", "2026-12-23T11:00"); await fill("Cost (INR)", "6000");
    await click(x("//div[@role='dialog']//button[@type='submit']")); await modalClosed(); await waitText("Seaside Shack");
    await shot("05-logistics");
  });
  await step("an activity that clashes with check-out shows a conflict and a suggested slot", async () => {
    await click(btn("Add Activity"));
    await waitText("Add Activity");
    await fill("Title", "Fort Aguada Sunset Visit"); await fill("Starts", "2026-12-23T10:15"); await fill("Ends", "2026-12-23T12:00");
    await fill("Description (used for search)", "Old Portuguese fort with a lighthouse overlooking the sea at sunset");
    await fill("Tags (comma separated)", "fort, sunset, history");
    await click(x("//div[@role='dialog']//button[@type='submit']"));
    await waitText("Schedule conflict");
    await shot("06-activity-conflict");
    await click(btn("Use suggested time"));
    await modalClosed();
    await waitText("Fort Aguada Sunset Visit");
    await waitText("11:00 → 12:45"); // moved to the suggested slot right after check-out
  });
  await step("budget and expenses are computed from saved data", async () => {
    await tab("Expenses");
    await click(btn("+ Set budget")); await fill("Planned amount (INR)", "5000");
    await click(x("//div[@role='dialog']//button[@type='submit']")); await modalClosed(); await waitText("₹5,000");
    await click(btn("+ Add Expense")); await fill("Amount (INR)", "1234.5"); await fill("Description", "Seafood dinner");
    await click(x("//div[@role='dialog']//button[@type='submit']")); await modalClosed(); await waitText("Seafood dinner");
    await waitText("₹1,234.5"); await waitText("₹3,765.5");
    await shot("07-budget");
  });
  await step("search finds the activity and says which engine answered", async () => {
    await tab("Experiences");
    const input = await visible(x("//input[@aria-label='Search activities']"));
    await setValue(input, "lighthouse fort"); await click(x("//button[normalize-space()='Search']"));
    await waitText("Fort Aguada Sunset Visit", 20000);
    const t = await bodyText();
    if (!/semantic · pgvector cosine|keyword · full-text/i.test(t)) throw new Error("search did not label its engine");
    await shot("08-search");
  });
  await step("schedule assistant is clear after the fix", async () => {
    await tab("Schedule Assistant"); await waitText("Schedule Clear");
  });
  await step("everything persists after a full page reload", async () => {
    await driver.navigate().refresh(); await waitText("Goa Beach Week");
    await tab("Experiences"); await waitText("Fort Aguada Sunset Visit");
    await tab("Expenses"); await waitText("Seafood dinner");
  });
  await step("no failed network requests during the journey", async () => {
    const bad = await badRequests();
    if (bad.length) throw new Error("failed requests: " + bad.join(", "));
  });
  await step("sign out, sign back in, data still there", async () => {
    await click(x("//button[@aria-label='Sign out']")); await driver.wait(until.urlContains("/login"), 15000);
    await fill("Email", EMAIL); await fill("Password", "WrongPassword9"); await click(x("//form//button[@type='submit']")); await waitText("Invalid email or password");
    await fill("Password", PASS); await click(x("//form//button[@type='submit']")); await driver.wait(until.urlContains("/dashboard"), 20000);
    await waitText("Goa Beach Week");
  });
  await step("dashboard search and filters work", async () => {
    await setValue(await visible(x("//input[@aria-label='Search trips']")), "zzzz-nothing");
    await waitText("No trips match your filters");
    await click(btn("Clear filters")); await waitText("Goa Beach Week");
  });

  console.log("Journey B — access isolation");
  await step("another user cannot open the first user's trip", async () => {
    await click(x("//button[@aria-label='Sign out']")); await driver.wait(until.urlContains("/login"), 15000);
    await goto("/register");
    await fill("Full Name", "Second Tester"); await fill("Email", EMAIL2); await fill("Password", PASS); await click(x("//button[@type='submit']"));
    await driver.wait(until.urlContains("/dashboard"), 20000);
    await goto(tripUrl); await waitText("Trip not found");
    await shot("09-trip-not-found");
  });

  console.log("Journey C — seeded demo trip (screenshots)");
  await step("demo organizer sees timeline, conflict banner and every tab", async () => {
    await goto("/login");
    await click(x("//button[@aria-label='Sign out']")).catch(() => {});
    await goto("/login"); await fill("Email", "ronak@example.com"); await fill("Password", process.env.SEED_DEMO_PASSWORD || "DemoPass123"); await click(x("//form//button[@type='submit']"));
    await driver.wait(until.urlContains("/dashboard"), 20000); await waitText("Hampi Heritage Tour");
    await shot("10-dashboard");
    await click(x("//a[contains(., 'Open Itinerary')]")); await waitText("Schedule Collision");
    await shot("11-trip-timeline");
    await tab("Transit"); await waitText("KSRTC Airavat"); await shot("12-logistics");
    await tab("Experiences"); await waitText("Coracle Ride"); await shot("13-activities");
    await tab("Expenses"); await waitText("Traveler balances"); await shot("14-budget-balances");
    await tab("Schedule Assistant"); await waitText("Schedule Collision Center"); await shot("15-schedule-assistant");
    await tab("Travelers"); await waitText("Invite a traveler"); await shot("16-travelers");
  });
  await step("viewer sees a read-only trip (no add/edit controls)", async () => {
    await click(x("//button[@aria-label='Sign out']")); await driver.wait(until.urlContains("/login"), 15000);
    await fill("Email", "priya@example.com"); await fill("Password", process.env.SEED_DEMO_PASSWORD || "DemoPass123"); await click(x("//form//button[@type='submit']"));
    await driver.wait(until.urlContains("/dashboard"), 20000);
    await click(x("//a[contains(., 'Open Itinerary')]")); await waitText("Your role: Viewer");
    const adds = await driver.findElements(btn("Add Activity"));
    if (adds.length) throw new Error("viewer can see Add Activity");
    await tab("Expenses"); await waitText("Traveler balances");
    if ((await driver.findElements(btn("+ Add Expense"))).length) throw new Error("viewer can see Add Expense");
  });
  await step("admin page shows the three stores and is hidden from normal users", async () => {
    await goto("/admin"); await waitText("Administrator access required");
    await click(x("//button[@aria-label='Sign out']")); await driver.wait(until.urlContains("/login"), 15000);
    await fill("Email", process.env.SEED_ADMIN_EMAIL || "admin@tripsync.local"); await fill("Password", process.env.SEED_ADMIN_PASSWORD); await click(x("//form//button[@type='submit']"));
    await driver.wait(until.urlContains("/dashboard"), 20000);
    await goto("/admin"); await waitText("Cross-database consistency"); await shot("17-admin");
  });
  await step("architecture page uses the app's light theme", async () => {
    await goto("/architecture"); await waitText("One application, three data models"); await shot("18-architecture");
  });
  await step("mobile layout (390px) has no horizontal overflow", async () => {
    await driver.manage().window().setRect({ width: 390, height: 844 });
    for (const p of ["/", "/login", "/dashboard", "/dashboard/1"]) {
      await goto(p); await driver.sleep(1200);
      const over = await driver.executeScript("return document.documentElement.scrollWidth - document.documentElement.clientWidth");
      if (over > 1) throw new Error(`${p} overflows horizontally by ${over}px`);
    }
    await goto("/dashboard/1"); await driver.sleep(1200); await shot("19-mobile-trip");
  });
} finally {
  await driver.quit();
  // cleanup everything created by this run
  const mongo = await MongoClient.connect(process.env.MONGODB_URI);
  const trips = await pgPool.query("SELECT trip_id FROM trips WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE '%@uitest.local')");
  for (const r of trips.rows) await mongo.db(process.env.MONGODB_DB || "tripsync").collection("activities").deleteMany({ tripId: r.trip_id });
  await pgPool.query("DELETE FROM trips WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE '%@uitest.local')");
  await pgPool.query("DELETE FROM users WHERE email LIKE '%@uitest.local'");
  await pgPool.end(); await mongo.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nUI end-to-end: ${results.length - failed.length}/${results.length} steps passed`);
fs.writeFileSync("docs/test-results/ui-results.json", JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
