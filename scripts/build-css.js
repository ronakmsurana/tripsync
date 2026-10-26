// ============================================
// CSS Builder using @tailwindcss/postcss
// ============================================
// Compiles Tailwind v4 utilities & custom tokens
// into src/app/globals.css for 100% reliable rendering
// across both Turbopack and Webpack.
// ============================================

const fs = require("fs");
const path = require("path");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");

async function buildCss() {
  const srcPath = path.join(__dirname, "../src/app/globals.src.css");
  const destPath = path.join(__dirname, "../src/app/globals.css");

  const rawCss = fs.readFileSync(srcPath, "utf8");
  const result = await postcss([tailwind()]).process(rawCss, {
    from: srcPath,
    to: destPath,
  });

  fs.writeFileSync(destPath, result.css);
  console.log(`✓ Compiled CSS (${result.css.length} bytes) to src/app/globals.css`);
}

buildCss().catch((err) => {
  console.error("CSS build error:", err);
  process.exit(1);
});
