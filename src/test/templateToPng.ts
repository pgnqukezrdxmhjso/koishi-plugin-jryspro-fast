import { loadService } from "./testBase";
import fs from "node:fs/promises";

(async () => {
  const toImageService = await loadService();

  let html = await fs.readFile("../../assets/template.html", {
    encoding: "utf-8",
  });
  html = html
    .replace(/[\s\S]*<body[^>]*>([\s\S]*)<\/body>[\s\S]*/, "$1")
    .trim();
  console.log(html);

  console.time("to png");
  const png = await toImageService.htmlToImage(html, {
    width: 640,
    height: 1080,
  });
  console.timeEnd("to png");
  await fs.writeFile("./templateToPng.png", png);
})();
