import { loadService } from "./testBase";
import fs from "node:fs/promises";

(async () => {
  const toImageService = await loadService();

  let html = await fs.readFile("../../assets/template2.html", {
    encoding: "utf-8",
  });
  html = html
    .replace(/[\s\S]*<body[^>]*>([\s\S]*)<\/body>[\s\S]*/, "$1")
    .trim();
  console.log(html);

  console.time("to png");
  const png = await toImageService.htmlToImage(html, {
    format: "png",
    height: 1040,
  });
  console.timeEnd("to png");
  await fs.writeFile("./template2ToPng.png", png);
})();
