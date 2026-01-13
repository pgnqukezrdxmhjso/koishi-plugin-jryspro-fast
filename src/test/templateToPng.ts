import ToImageService from "koishi-plugin-to-image-service";
import fs from "node:fs/promises";

(async () => {
  const toImageService = new ToImageService({} as any, {});
  await toImageService.start();
  let html = await fs.readFile("../../assets/template.html", {
    encoding: "utf-8",
  });
  html = html
    .replace(/[\s\S]*<body[^>]*>([\s\S]*)<\/body>[\s\S]*/, "$1")
    .trim();
  console.log(html);

  console.time("to svg");
  const reactElement = toImageService.toReactElement.htmlToReactElement(html);
  const svg = await toImageService.reactElementToSvg.satori(reactElement, {
    width: 640,
    height: 1080,
  });
  console.timeEnd("to svg");

  console.time("to png");
  const png = await toImageService.svgToImage.vips(svg, {
    format: "png",
  });
  console.timeEnd("to png");
  await fs.writeFile("./templateToPng.png", png);
})();
