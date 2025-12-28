import VercelSatoriPngService from "koishi-plugin-vercel-satori-png-service";
import fs from "node:fs/promises";

(async () => {
  const vercelSatoriPngService = new VercelSatoriPngService({} as any, {});
  await vercelSatoriPngService.start();
  let html = await fs.readFile("../../assets/template2.html", {
    encoding: "utf-8",
  });
  console.time("template2ToPng");
  html = html
    .replace(/[\s\S]*<body[^>]*>([\s\S]*)<\/body>[\s\S]*/, "$1")
    .trim();
  console.log(html);
  const png = await vercelSatoriPngService.htmlToPng(html, {
    height: 1040,
  });
  console.timeEnd("template2ToPng");
  await fs.writeFile("./template2ToPng.png", png);
})();
