import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const appRoot = join(process.cwd(), "apps", "mobile");
const blockedPaths = [
  join(appRoot, "src", "app", "api"),
  join(appRoot, "app", "api")
];
const middlewareNames = new Set(["middleware.ts", "middleware.js"]);
const serverActionPattern = /["']use server["']/;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoredDirectories = new Set([
  ".next",
  "android",
  "ios",
  "node_modules",
  "out"
]);

const failures = [];

for (const path of blockedPaths) {
  if (existsSync(path)) {
    failures.push(`Next.js API Routes are not allowed: ${relative(process.cwd(), path)}`);
  }
}

function extensionOf(fileName) {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index);
}

function scanDirectory(directory) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (ignoredDirectories.has(entry)) {
        continue;
      }

      scanDirectory(path);
      continue;
    }

    if (middlewareNames.has(entry)) {
      failures.push(`Next.js Middleware is not allowed: ${relative(process.cwd(), path)}`);
    }

    if (!sourceExtensions.has(extensionOf(entry))) {
      continue;
    }

    const contents = readFileSync(path, "utf8");
    if (serverActionPattern.test(contents)) {
      failures.push(`Server Actions are not allowed: ${relative(process.cwd(), path)}`);
    }
  }
}

scanDirectory(appRoot);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("No Next.js runtime backend files found.");
