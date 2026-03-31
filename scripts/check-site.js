// scripts/check-site.js

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SITE_URL = "https://www.trend-pulse.shop";
const AFFILIATE_TAG = "Drackk-20";

const HTML_FILES = walk(ROOT).filter((file) => file.endsWith(".html"));
const JS_FILES = walk(ROOT).filter((file) => file.endsWith(".js"));
const TEXT_FILES = [...HTML_FILES, ...JS_FILES, path.join(ROOT, "robots.txt"), path.join(ROOT, "sitemap.xml")].filter((file) => fs.existsSync(file));

const issues = [];
const warnings = [];
const passes = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".vercel") {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }

  return files;
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function addIssue(file, message) {
  issues.push(`${rel(file)} :: ${message}`);
}

function addWarning(file, message) {
  warnings.push(`${rel(file)} :: ${message}`);
}

function addPass(message) {
  passes.push(message);
}

function checkPlaceholderTags() {
  let found = false;

  for (const file of TEXT_FILES) {
    const content = read(file);
    if (content.includes("YOURAFFILIATETAG-20")) {
      addIssue(file, "contains placeholder affiliate tag YOURAFFILIATETAG-20");
      found = true;
    }
  }

  if (!found) addPass("No placeholder affiliate tags found.");
}

function checkAffiliateTagUsage() {
  let foundAmazonLink = false;
  let badAmazonLink = false;

  for (const file of TEXT_FILES) {
    const content = read(file);
    const matches = content.match(/https:\/\/www\.amazon\.com\/[^\s"'`<)]+/g) || [];
    for (const match of matches) {
      foundAmazonLink = true;
      if (!match.includes(`tag=${AFFILIATE_TAG}`)) {
        addWarning(file, `Amazon link missing correct affiliate tag: ${match}`);
        badAmazonLink = true;
      }
    }
  }

  if (foundAmazonLink && !badAmazonLink) addPass(`All detected Amazon links contain tag=${AFFILIATE_TAG}.`);
}

function checkCanonicals() {
  let allGood = true;

  for (const file of HTML_FILES) {
    const content = read(file);
    const canonicalMatch = content.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);

    if (!canonicalMatch) {
      addIssue(file, "missing canonical tag");
      allGood = false;
      continue;
    }

    if (!canonicalMatch[1].startsWith(SITE_URL)) {
      addIssue(file, `canonical does not use ${SITE_URL}`);
      allGood = false;
    }
  }

  if (allGood) addPass("All HTML files include canonicals on the www domain.");
}

function checkOgUrl() {
  let allGood = true;

  for (const file of HTML_FILES) {
    const content = read(file);
    const match = content.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);

    if (!match) {
      addIssue(file, "missing og:url");
      allGood = false;
      continue;
    }

    if (!match[1].startsWith(SITE_URL)) {
      addIssue(file, `og:url does not use ${SITE_URL}`);
      allGood = false;
    }
  }

  if (allGood) addPass("All HTML files include og:url on the www domain.");
}

function checkLegalLinks() {
  let allGood = true;

  for (const file of HTML_FILES) {
    const content = read(file);

    const required = [
      '/affiliate-disclosure.html',
      '/privacy.html',
      '/terms.html',
      '/contact.html'
    ];

    for (const item of required) {
      if (!content.includes(item)) {
        addIssue(file, `missing legal link ${item}`);
        allGood = false;
      }
    }
  }

  if (allGood) addPass("All HTML files contain core legal links.");
}

function checkDisclosureText() {
  let allGood = true;
  const expected = "As an Amazon Associate, TrendPulse earns from qualifying purchases.";

  for (const file of HTML_FILES) {
    const content = read(file);
    if (!content.includes(expected)) {
      addWarning(file, "missing standard Amazon Associate disclosure text");
      allGood = false;
    }
  }

  if (allGood) addPass("All HTML files contain the standard Amazon Associate disclosure.");
}

function checkRobotsAndSitemap() {
  const robots = path.join(ROOT, "robots.txt");
  const sitemap = path.join(ROOT, "sitemap.xml");

  if (!fs.existsSync(robots)) {
    addIssue(robots, "robots.txt is missing");
  } else {
    const content = read(robots);
    if (!content.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
      addIssue(robots, `robots.txt sitemap must be ${SITE_URL}/sitemap.xml`);
    } else {
      addPass("robots.txt points to the correct sitemap.");
    }
  }

  if (!fs.existsSync(sitemap)) {
    addIssue(sitemap, "sitemap.xml is missing");
  } else {
    const content = read(sitemap);
    if (!content.includes(SITE_URL)) {
      addIssue(sitemap, `sitemap.xml does not use ${SITE_URL}`);
    } else {
      addPass("sitemap.xml uses the www domain.");
    }
  }
}

function checkDuplicateAsins() {
  const file = path.join(ROOT, "assets/js/trendpulse-data.js");

  if (!fs.existsSync(file)) {
    addIssue(file, "assets/js/trendpulse-data.js is missing");
    return;
  }

  const content = read(file);
  const matches = [...content.matchAll(/asin:\s*"([^"]+)"/g)].map((match) => match[1]);
  const seen = new Set();
  const duplicates = new Set();

  for (const asin of matches) {
    if (seen.has(asin)) duplicates.add(asin);
    seen.add(asin);
  }

  if (duplicates.size) {
    addIssue(file, `duplicate ASINs found: ${[...duplicates].join(", ")}`);
  } else {
    addPass("No duplicate ASINs found in assets/js/trendpulse-data.js.");
  }
}

function checkCentralScriptsIncluded() {
  const requiredScripts = [
    '/assets/js/trendpulse-data.js',
    '/assets/js/trendpulse-ui.js'
  ];

  let allGood = true;

  for (const file of HTML_FILES) {
    const content = read(file);
    for (const script of requiredScripts) {
      if (!content.includes(script)) {
        addWarning(file, `missing script include ${script}`);
        allGood = false;
      }
    }
  }

  if (allGood) addPass("All HTML files include the central data and UI scripts.");
}

function checkRealSessionExposure() {
  const file = path.join(ROOT, "x-session.json");
  if (fs.existsSync(file)) {
    addWarning(file, "real X session file exists in repo; rotate it after repo returns to private");
  }
}

function printSection(title, items) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  if (!items.length) {
    console.log("none");
    return;
  }
  for (const item of items) console.log(item);
}

function main() {
  checkPlaceholderTags();
  checkAffiliateTagUsage();
  checkCanonicals();
  checkOgUrl();
  checkLegalLinks();
  checkDisclosureText();
  checkRobotsAndSitemap();
  checkDuplicateAsins();
  checkCentralScriptsIncluded();
  checkRealSessionExposure();

  printSection("PASS", passes);
  printSection("WARNINGS", warnings);
  printSection("ISSUES", issues);

  const hasIssues = issues.length > 0;
  process.exitCode = hasIssues ? 1 : 0;
}

main();
