import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import type * as FileType from "file-type";
import Vips from "wasm-vips";

import { Context, h, Logger, Random, Schema, Session } from "koishi";
// noinspection ES6UnusedImports
import {} from "koishi-plugin-rate-limit";
// noinspection ES6UnusedImports
import {} from "koishi-plugin-vercel-satori-png-service";

export const name = "jryspro-fast";

const logger = new Logger(name);

// noinspection JSUnusedGlobalSymbols
export const usage = `
## 更新插件前请停止运行插件
插件配置项可能会有改动，不停止插件直接更新可能会导致koishi炸掉

## 使用说明

> 如果你无法使用此插件，请检查
> - 1. (使用命令时无反应，报错等)请检查指令是否有冲突或者是否正确安装vercelSatoriPngService
> - 2. 提示“发生未知错误”可能是没有获取到群友的uid，需要在数据库内刷新一下
> - 3. “数据出错”之类的提示不是本插件的提示，可能你装了其他插件
> - 4. 启用不了插件。请检查koishi版本，vercelSatoriPngService版本等是否再兼容范围内，或重启koishi，删除此插件依赖再尝试重装

随机文件夹内图片时请注意路径\`C:/user/path/to/\`不要把后面的/忘了

## api说明
* api url以 #e# 结尾可以在末尾添加更新时间戳(例子后面等价的数字为当前时间戳)
* 例: https://api.example.com/img?#e#  ==等价于== https://api.example.com/img?271878
* 例: https://api.example.com/img?type=acc&v=#e#  ==等价于== https://api.example.com/img?type=acc&v=271878

imgApi与subimgApi支持本地文件夹绝对路径和http(s)等网络api
`;

export interface Config {
  interval: number;
  nightauto: boolean;
  nightStart: number;
  nightEnd: number;
  imgApi: string;
  imgQuality: number;
  waiting: boolean;
  callme: boolean;
  defaultMode: number;
  subimgApi: string;
  avatarUrl: string;
}

export const schema = Schema.object({
  interval: Schema.number()
    .default(30000)
    .description("指令调用间隔(单位ms)[需要加载数据库]"),
  nightauto: Schema.boolean().default(true).description("是否开启自动夜间模式"),
  nightStart: Schema.number()
    .default(19)
    .description(
      "自动夜间模式开启时间整点(24时制),结束时间要小于开始时间[晚上]",
    ),
  nightEnd: Schema.number()
    .default(8)
    .description(
      "自动夜间模式关闭时间整点(24时制),结束时间要小于开始时间[早上]",
    ),
  imgApi: Schema.string()
    .role("link")
    .required()
    .description(
      "[必填]渲染模式美图的api或文件夹(推荐纯竖屏),仅支持返回图片的api,不要忘记http(s)://",
    ),
  imgQuality: Schema.percent().default(0.4).description("渲染图输出质量"),
  waiting: Schema.boolean()
    .default(true)
    .description("是否开启发送消息等待提示"),
  callme: Schema.boolean().default(false).description("是否开启callme功能"),
  defaultMode: Schema.union([0, 1, 2, 3])
    .default(2)
    .description(
      "选择默认输出模式: 0.图片渲染，1.纯文本，2.新版竖屏，3.图文结合",
    ),
  subimgApi: Schema.string()
    .role("link")
    .description(
      "图文模式图片的api或文件夹,仅支持返回图片的api,不要忘记http(s)://",
    ),
  avatarUrl: Schema.string()
    .role("link")
    .description("默认头像URL(https?://或者file:///)"),
});

export const inject = ["vercelSatoriPngService", "database"];

export interface JrysItem {
  fortuneSummary: string;
  luckyStar: string;
  signText: string;
  unsignText: string;
}
interface ImgMetaData {
  width: number;
  height: number;
}

export async function apply(ctx: Context, config: Config) {
  let fileType: typeof FileType = await import("file-type");
  const vips = await Vips();

  const template = fs
    .readFileSync(path.join(__dirname, "../assets/template.html"), "utf8")
    .replace(/[\s\S]*<body[^>]*>([\s\S]*)<\/body>[\s\S]*/, "$1")
    .trim();
  const template2 = fs
    .readFileSync(path.join(__dirname, "../assets/template2.html"), "utf8")
    .replace(/[\s\S]*<body[^>]*>([\s\S]*)<\/body>[\s\S]*/, "$1")
    .trim();
  const defaultAvatar =
    `data:image/png;base64,` +
    Buffer.from(
      fs.readFileSync(path.join(__dirname, "../assets/avatar.png")),
    ).toString("base64");
  const jrysJson: JrysItem[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../assets/jrys.json"), "utf8"),
  );

  ctx
    .command(
      "jryspro-fast",
      `查看今日运势(${config.nightStart % 24}~${config.nightEnd % 24}点自动夜间模式)`,
      { minInterval: config.interval ? config.interval : 30000 },
    )
    .alias("jrys")
    .alias("今日运势")
    .option("out", "-o 仅输出纯文本")
    .option("nonight", "-n 无视夜间模式输出")
    .option("txtimg", "-t 图文输出")
    .option("img", "-i 渲染输出")
    .option("debug", "-d 调试")
    .option("new", "-N 新版输出")
    .userFields(["name"])
    .action(async ({ session, options }): Promise<any> => {
      // 配置文件防失误
      if (config.nightEnd % 24 > config.nightStart % 24) {
        config.nightStart = 19;
        config.nightEnd = 8;
      }
      if (config.defaultMode > 3) config.defaultMode = 0;

      // callMe修改昵称 支持
      let name: string;
      if (ctx.database && config.callme) {
        name = session.user.name ? session.user.name : session.username;
      }
      if (!name && config.callme) {
        name = session.author.name ? session.author.name : session.username;
      } else {
        name = session.username;
      }

      if (options.debug) {
        const userKey = getUserKey(session);
        return `Jrys Debugger: jrysNumber:${userKey.key}, etime: ${userKey.etime / 100000}`;
      }

      let brightness: string;

      const currentDate = new Date();
      const notNight =
        !config.nightauto ||
        options.nonight ||
        ((config.nightEnd ? config.nightEnd : 8) <= currentDate.getHours() &&
          currentDate.getHours() <
            (config.nightStart ? config.nightStart : 19));
      if (notNight) {
        brightness = "brightness(100%)";
      } else {
        brightness = "brightness(65%)";
      }

      // 图片处理
      const eTime = (Date.now() % 25565) + "";

      let backgroundUrl: string;
      if (/^https?:\/\//i.test(config.imgApi)) {
        backgroundUrl = config.imgApi.replace(/#e#$/gi, eTime);
      } else {
        backgroundUrl =
          "file:///" +
          path.resolve(
            __dirname,
            config.imgApi,
            "." + path.sep,
            Random.pick(await getFolderImg(config.imgApi)),
          );
      }

      let subImgUrl: string;
      if (config.subimgApi) {
        if (/^https?:\/\//i.test(config.subimgApi)) {
          subImgUrl = config.imgApi.replace(/#e#$/gi, eTime);
        } else {
          subImgUrl =
            "file:///" +
            path.resolve(
              __dirname,
              config.subimgApi,
              "." + path.sep,
              Random.pick(await getFolderImg(config.subimgApi)),
            );
        }
      }

      const dJson = getJrys(session);

      if (
        options.out ||
        (config.defaultMode === 1 && !options.img && !options.txtimg)
      ) {
        return h.parse(
          `<p>${name}的今日运势为</p>
           <p>${dJson.fortuneSummary}</p>
           <p>${dJson.luckyStar}</p>
           <p>${dJson.signText}</p>
           <p>仅供娱乐|勿封建迷信|仅供娱乐</p>`,
        );
      } else if (
        options.new ||
        (config.defaultMode === 2 &&
          !options.out &&
          !options.txtimg &&
          !options.img)
      ) {
        if (config.waiting) session.send("请稍等,正在查询……").then();
        try {
          const width = 640;
          const height = 1080;
          const avatarUrl =
            session.platform == "qq"
              ? `https://q.qlogo.cn/qqapp/${session.bot.config.id}/${session.event.user.id}/140`
              : session.author.avatar || config.avatarUrl || defaultAvatar;

          const background = await downloadUrl({
            url: backgroundUrl,
            cover: {
              width,
              height,
            },
          });
          const avatar = await downloadUrl({
            url: avatarUrl,
          });

          const replacedContent = template
            .replace(
              "https://dummyimage.com/389x399/6e2d6e/c2c5ed.png",
              background.base64,
            )
            .replace(
              "https://dummyimage.com/99x99/6e2d6e/c2c5ed.png",
              avatar.base64,
            )
            .replace("brightness(100%)", brightness)
            .replace(
              "你是一个一个用户名啊啊啊啊啊啊啊啊啊啊啊啊",
              name.length > 12 ? name.substring(0, 12) : name,
            )
            .replace(
              "你是一个一个幸运星啊啊啊啊啊啊啊啊啊啊啊啊",
              `${dJson.fortuneSummary.toString().length > 8 ? dJson.fortuneSummary.toString().substring(0, 8) : dJson.fortuneSummary}&nbsp;&nbsp;${dJson.luckyStar}`,
            )
            .replace(
              "你是一个一个签名啊啊啊啊啊啊啊啊啊啊啊啊",
              `${dJson.signText.split("，")[0]}，${dJson.signText.split("，")[1]}<br/>${dJson.signText.split("，")[2]}，${dJson.signText.split("，")[3]}`,
            );
          const png = await ctx.vercelSatoriPngService.htmlToPng(
            replacedContent,
            {
              width,
              height,
            },
          );
          return [h.image((await png.toArray())[0], "image/png")];
        } catch (err) {
          logger.error(err);
          return "渲染失败，不知道发生了啥";
        }
      } else if (
        options.img ||
        (config.defaultMode === 0 &&
          !options.out &&
          !options.txtimg &&
          !options.new)
      ) {
        if (config.waiting) session.send("请稍等,正在查询……").then();
        try {
          let width = 357;
          const height = 1040;

          const background = await downloadUrl({
            url: backgroundUrl,
            needMetadata: true,
          });

          width += Math.round(
            ((height - 14) / background.metaData.height) *
              background.metaData.width,
          );

          const replacedContent = template2
            .replace(
              /rgba\(255, 255, 255, 0\.6\)/g,
              notNight
                ? "rgba(255, 255, 255, 0.6)"
                : "rgba(105, 105, 105, 0.6)",
            )
            .replace(
              "0 0 15px rgba(0, 0, 0, 0.3)",
              notNight
                ? "0 0 15px rgba(0, 0, 0, 0.3)"
                : "0 0 15px rgba(255, 255, 255, 0.3)",
            )
            .replace("brightness(100%)", brightness)
            .replace("你是一个一个用户名啊啊啊啊啊啊啊啊啊啊啊啊", name)
            .replace(
              "你是一个一个吉凶啊啊啊啊啊啊啊啊啊啊啊啊",
              dJson.fortuneSummary,
            )
            .replace(
              "你是一个一个星星啊啊啊啊啊啊啊啊啊啊啊啊",
              dJson.luckyStar,
            )
            .replace(
              "https://dummyimage.com/189x399/6e2d6e/c2c5ed.png",
              background.base64,
            )
            .replace(
              /<!--签名开始-->[\s\S]*<!--签名结束-->/,
              dJson.signText
                .split("")
                .map((s) => `<div>${s}</div>`)
                .join(""),
            )
            .replace(
              /<!--解签开始-->[\s\S]*<!--解签结束-->/,
              dJson.unsignText
                .split("")
                .map((s) => `<div>${s}</div>`)
                .join(""),
            );
          const png = await ctx.vercelSatoriPngService.htmlToPng(
            replacedContent,
            {
              width,
              height,
            },
          );
          return [h.image((await png.toArray())[0], "image/png")];
        } catch (err) {
          logger.error(err);
          return "渲染失败，不知道发生了啥";
        }
      } else {
        if (config.waiting) session.send("请稍等,正在查询……").then();
        try {
          const img = await downloadUrl({
            url: subImgUrl || backgroundUrl,
          });

          return h.parse(
            `<p>${name}的今日运势为</p>
             <p>${dJson.fortuneSummary}</p>
             <p>${dJson.luckyStar}</p>
             <p>${dJson.signText}</p>
             <img url="${img.base64}" alt="" />`,
          );
        } catch (err) {
          logger.error(err);
          return h.parse(
            `<p>${name}的今日运势为</p>
             <p>${dJson.fortuneSummary}</p>
             <p>${dJson.luckyStar}</p>
             <p>图片Url: ${subImgUrl || backgroundUrl}</p>`,
          );
        }
      }
    });

  function getUserKey(session: Session) {
    let etime = new Date().setHours(0, 0, 0, 0);
    let userId: number;
    if (!isNaN(+session.event.user.id)) {
      userId = +session.event.user.id;
    } else if (session.event.user.id) {
      const hash = crypto.createHash("sha256");
      hash.update(session.event.user.id + String(etime));
      let hashHexDigest = hash.digest("hex");
      userId = Number(parseInt(hashHexDigest, 16)) % 1000000001;
    } else {
      const md5 = crypto.createHash("md5");
      md5.update(session.username + String(etime));
      let hexDigest = md5.digest("hex");
      userId = parseInt(hexDigest, 16) % 1000000001;
    }
    return {
      key: ((((etime / 100000) * userId) % 1000001) * 2333) % jrysJson.length,
      etime,
    };
  }

  function getJrys(session: Session) {
    return jrysJson[getUserKey(session).key];
  }

  async function downloadUrl({
    url,
    cover,
    needMetadata,
  }: {
    url: string;
    cover?: { width: number; height: number };
    needMetadata?: boolean;
  }): Promise<{ base64: string; metaData?: ImgMetaData }> {
    if (/^data:/i.test(url)) {
      return { base64: url };
    }
    let imgData: Buffer;
    if (/^https?:/i.test(url)) {
      imgData = Buffer.from(await ctx.http.get<ArrayBuffer>(url));
    } else if (/^file:/i.test(url)) {
      imgData = await fs.promises.readFile(url.replace(/^file:\/+/, ""));
    } else {
      logger.error("未知url类型");
      throw "渲染失败，不知道发生了啥";
    }

    const imgType = await fileType.fileTypeFromBuffer(imgData);

    let img: Vips.Image;
    let metaData: ImgMetaData;
    const touchImg = () => {
      if (!img) {
        img = vips.Image.newFromBuffer(imgData);
      }
    };

    if (needMetadata) {
      touchImg();
      metaData = {
        width: img.width,
        height: img.height,
      };
    }

    if (cover) {
      img = vips.Image.thumbnailBuffer(imgData, cover.width, {
        height: cover.height,
        crop: vips.Interesting.centre,
      });

      if (imgType.ext !== "webp") {
        imgData = Buffer.from(img.pngsaveBuffer());
      }
    }

    let mime = imgType.mime;
    if (imgType.ext === "webp") {
      touchImg();
      imgData = Buffer.from(img.pngsaveBuffer());
      mime = "image/png";
    }
    return {
      base64: `data:${mime};base64,` + imgData.toString("base64"),
      metaData,
    };
  }
}

async function getFolderImg(folder: string) {
  return readFileNames(folder, (fileName) =>
    /\.(png|jpg|jpeg|webp|svg)$/i.test(fileName),
  );
}

function readFileNames(
  dirPath: string,
  verify: (fileName: string) => boolean,
  basePath: string = "",
) {
  let filenames = [];
  const files = fs.readdirSync(dirPath);
  files.forEach((filename) => {
    const fullPath = path.join(dirPath, filename);
    if (fs.statSync(fullPath).isDirectory()) {
      filenames.push(
        ...readFileNames(fullPath, verify, path.join(basePath, filename)),
      );
    } else if (verify(filename)) {
      filenames.push(path.join(basePath, filename));
    }
  });
  return filenames;
}
