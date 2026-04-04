import WNode from "koishi-plugin-w-node";
import path from "node:path";
import ToImageService from "koishi-plugin-to-image-service";


export async function loadService(config: any = {}) {
  const command = {
    action() {
      return command;
    },
    option() {
      return command;
    },
    alias() {
      return command;
    },
  };
  const ctx = {
    command() {
      return command;
    },
    i18n: {
      define: (a, b) => b,
    },
    on: () => 0,
    logger: {
      error: console.error,
    },
    inject() {},
  };
  const node = new WNode(ctx as any, {
    packagePath: path.resolve(__dirname, "../../../cache/node"),
    registry: "https://registry.npmmirror.com/",
  });
  await node.start();

  const toImageService = new ToImageService(
    { ...ctx, node } as any,
    config as any,
  );
  await toImageService.start();

  return toImageService;
}
