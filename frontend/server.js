const http = require("http");
const fs = require("fs");
const path = require("path");
const handler = require("serve-handler");

const DIST = path.join(__dirname, "dist");
const PORT = process.env.PORT || 8080;

const SPECIAL = {
  "/.well-known/apple-app-site-association": "application/json",
  "/.well-known/assetlinks.json": "application/json",
};

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  if (SPECIAL[url]) {
    const filePath = path.join(DIST, url);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": SPECIAL[url] });
      res.end(data);
    });
    return;
  }
  return handler(req, res, {
    public: DIST,
    rewrites: [{ source: "**", destination: "/index.html" }],
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Serving on port ${PORT}`);
});
