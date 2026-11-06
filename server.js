const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 8080;
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8"
};
const blockedFiles = new Set(["server.js"]);
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { ...securityHeaders, "Content-Type": type });
  res.end(body);
}

http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad request");
  }
  if (urlPath.endsWith("/")) urlPath += "index.html";
  // Block dotfiles and dot folders such as .git, plus anything outside the project folder.
  if (urlPath.split(/[\\/]/).some((seg) => seg.startsWith("."))) return send(res, 404, "Not found");
  const file = path.resolve(root, "." + urlPath);
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return send(res, 403, "Forbidden");
  const type = types[path.extname(file).toLowerCase()];
  if (!type || blockedFiles.has(rel)) return send(res, 404, "Not found");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found");
    send(res, 200, req.method === "HEAD" ? undefined : data, type);
  });
}).listen(port, host, () => console.log(`Hop n Shop running at http://localhost:${port}`));
