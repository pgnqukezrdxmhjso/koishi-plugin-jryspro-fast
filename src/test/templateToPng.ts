import VercelSatoriPngService from "koishi-plugin-vercel-satori-png-service";
import fs from "node:fs/promises";

(async () => {
  const vercelSatoriPngService = new VercelSatoriPngService({} as any, {});
  await vercelSatoriPngService.start();
  let html = await fs.readFile("../template.html", {
    encoding: "utf-8",
  });
  console.time("templateToPng");
  html = html
    .replace(/[\s\S]*<body[^>]*>([\s\S]*)<\/body>[\s\S]*/, "$1")
    .trim();
  console.log(html);
  const png = await vercelSatoriPngService.htmlToPng(html, {
    width: 640,
    height: 1080,
  });
  console.timeEnd("templateToPng");
  await fs.writeFile("./templateToPng.png", png);
})();
