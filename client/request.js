const http = require("http");
const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");
const htmlparser2 = require("htmlparser2");
const css = require("css");
const main = require("./main");
const network = require("./network");
const render = require("./render");
const gpu = require("./gpu");
const host = "localhost";
const port = 80;
const loadingLinks = {};
const loadingScripts = {};

// 浏览器主进程接收请求
main.on("request", function (options) {
  // 会把请求转发给网络进程
  network.emit("request", options);
});

// 主进程接收到消息后，要通知渲染进程进行开始渲染
main.on("prepareRender", function (response) {
  // 主进程发送提交导航的消息给渲染进程
  render.emit("commitNavigation", response);
});

// *********网络进程********************
network.on("request", (options) => {
  // 调用http模块发送请求给服务
  const request = http.request(options, (response) => {
    const headers = response.headers;
    // 告诉主进程请开始渲染页面
    main.emit("prepareRender", response);
  });
  request.end();
});

// 浏览器主进程接收到合成线程发过来的 DrawQuad 命令，根据 DrawQuad 命令，绘制在屏幕上。
main.on("drawQuad", () => {
  const drawSteps = gpu.bitMaps.flat();
  const canvas = createCanvas(150, 250);
  const ctx = canvas.getContext("2d");
  console.log(drawSteps);
  // [
  //   "ctx.fillStyle = 'white'",
  //   'ctx.fillRect(0,0,100,0)',
  //   "ctx.fillStyle = 'red'",
  //   'ctx.fillRect(0,0,100,100)',
  //   "ctx.font = '20px Impact'",
  //   "ctx.strokeStyle = 'green'",
  //   'ctx.strokeText("hello",0,20)'
  // ]
  eval(drawSteps.join("\r\n"));
  fs.writeFileSync(path.resolve(__dirname, "../result.png"), canvas.toBuffer("image/png"));
});

// *********渲染进程********************
render.on("commitNavigation", (response) => {
  const headers = response.headers;
  // 获取响应体的类型
  const contentType = headers["content-type"];
  // 说明这是一个HTML响应
  if (contentType.indexOf("text/html") !== -1) {
    const document = { type: "document", attributes: {}, children: [] };
    const tokenStack = [document];
    const cssRules = [];
    // 1.通过渲染进程把html字符串转成DOM树
    const parser = new htmlparser2.Parser({
      // 遇到开始标签
      onopentag(tagName, attributes) {
        // 栈顶的就是父节点
        const parent = tokenStack[tokenStack.length - 1];
        // 创建新的DOM节点
        const child = {
          type: "element",
          tagName, // html
          children: [],
          attributes,
        };
        parent.children.push(child);
        tokenStack.push(child);
      },
      // 遇到文本
      ontext(text) {
        if (!/^[\r\n\s]*$/.test(text)) {
          // 文本节点不需要入栈
          const parent = tokenStack[tokenStack.length - 1];
          const child = {
            type: "text",
            text,
            tagName: "text", // html
            children: [],
            attributes: {},
          };
          parent.children.push(child);
        }
      },
      // 遇到结束标签
      onclosetag(tagName) {
        // 识别不同的标签做不同的处理
        switch (tagName) {
          case "style":
            const styleToken = tokenStack[tokenStack.length - 1];
            const cssAST = css.parse(styleToken.children[0].text);
            const rules = cssAST.stylesheet.rules;
            cssRules.push(...rules);
            break;
          case "link":
            const linkToken = tokenStack[tokenStack.length - 1];
            const href = linkToken.attributes.href;
            const options = { host, port, path: href };
            const promise = network.fetchResource(options).then(({ body }) => {
              delete loadingLinks[href];
              const cssAst = css.parse(body);
              cssRules.push(...cssAst.stylesheet.rules);
            });
            loadingLinks[href] = promise;
            break;
          case "script":
            const scriptToken = tokenStack[tokenStack.length - 1];
            const src = scriptToken.attributes.src;
            const promises = [
              ...Object.values(loadingLinks),
              ...Object.values(loadingScripts),
            ];
            if (src) {
              const options = { host, port, path: src };
              const promise = network
                .fetchResource(options)
                .then(({ body }) => {
                  delete loadingScripts[src];
                  // link 样式和脚本 script 都加载完毕才执行
                  return Promise.all(promises).then(() => eval(body));
                });
              loadingScripts[src] = promise;
            } else {
              const script = scriptToken.children[0].text;
              const ts = Date.now();
              const promise = Promise.all([
                ...Object.values(loadingLinks),
                ...Object.values(loadingScripts),
              ]).then(() => {
                delete loadingScripts[ts];
                eval(script);
              });
              loadingScripts[ts] = promise;
            }
            break;
          default:
            break;
        }
        // 最栈顶元素出栈
        tokenStack.pop();
      },
    });
    // 一旦接收到部分响应体，直接传递给htmlparser
    response.on("data", (buffer) => {
      parser.write(buffer.toString());
    });
    response.on("end", () => {
      // 需要等待所有的JS都加载执行完毕了，才会进行后续的渲染流程
      Promise.all(Object.values(loadingScripts)).then(() => {
        //（1）计算每个DOM节点的具体的样式、继承、层叠
        recalculateStyle(cssRules, document);
        //（2）创建一个只包含可见元素的布局树
        const html = document.children[0];
        const body = html.children[1];
        const layoutTree = createLayoutTree(body);
        //（3）更新布局树，计算每个元素布局信息
        updateLayoutTree(layoutTree);
        // 根据布局树生成分层树
        const layers = [layoutTree];
        createLayerTree(layoutTree, layers);
        //（4）根据分层树生成绘制步骤,并复合图层
        const paintSteps = compositeLayers(layers);
        //（5）先切成一个个小的图块
        const tiles = splitTiles(paintSteps);
        raster(tiles);
        // DOM解析完毕
        main.emit("DOMContentLoaded");
        // CSS和图片加载完成后
        main.emit("Load");
      });
    });
  }
});

/**
 * 切分为小图块
 * @param {*} paintSteps 绘制步骤
 * @returns
 */
function splitTiles(paintSteps) {
  // 切分一个一个小图片
  return paintSteps;
}

/**
 * 光栅化位图
 * 光栅化线程：1个光栅化线程，1秒是1张；如果是10张图片，10个线程，一秒就可以画10张
 * @param {*} tile 图块
 */
function rasterThread(tile) {
  // 光栅化线程，是把光栅化的工作交给 GPU进程 来完成，这个叫快速光栅化，或者说GPU光栅化
  gpu.emit("raster", tile);
}

/**
 * 把切好的图片进行光栅化处理，就是变成类似马赛克
 * @param {*} tiles 图块
 */
function raster(tiles) {
  tiles.forEach((tile) => rasterThread(tile));
  //到此位图就生成完毕 ,通知主进程可以显示了
  main.emit("drawQuad");
}

/**
 * 合成图层
 * @param {*} layers
 * @returns
 */
function compositeLayers(layers) {
  return layers.map((layer) => paint(layer));
}

/**
 * 绘制
 * @param {*} element 待绘制的元素（图层）
 * @param {*} paintSteps 存放绘制步骤
 * @returns
 */
function paint(element, paintSteps = []) {
  const {
    top = 0,
    left = 0,
    color = "black",
    background = "white",
    width = 100,
    height = 0,
  } = element.layout;
  if (element.type == "text") {
    paintSteps.push(`ctx.font = '20px Impact'`);
    paintSteps.push(`ctx.strokeStyle = '${color}'`);
    // parseFloat：10px -> 10
    paintSteps.push(
      `ctx.strokeText("${element.text}",${parseFloat(left)},${
        parseFloat(top) + 20
      })`
    );
  } else {
    paintSteps.push(`ctx.fillStyle = '${background}'`);
    paintSteps.push(
      `ctx.fillRect(${parseFloat(left)},${parseFloat(top)},${parseFloat(
        width
      )},${parseFloat(height)})`
    );
  }
  element.children.forEach((child) => paint(child, paintSteps));
  return paintSteps;
}

/**
 * 创建图层树
 * @param {*} element 节点元素
 * @param {*} layers 图层列表
 * @returns
 */
function createLayerTree(element, layers) {
  // 遍历子节点，判断是否要生成新的图层，如果生成，则从当前图层中删除
  element.children = element.children.filter(
    (child) => !createNewLayer(child, layers)
  );
  element.children.forEach((child) => createLayerTree(child, layers));
  return layers;
}

/**
 * 创建新的图层
 * @param {*} element 节点元素
 * @param {*} layers 图层列表
 * @returns
 */
function createNewLayer(element, layers) {
  let createdNewLayer = false;
  const attributes = element.attributes;
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "style") {
      const attributes = value.split(/;\s*/); //[background: green;]
      attributes.forEach((attribute) => {
        // background: green;
        const [property, value] = attribute.split(/:\s*/); //['background',green]
        if (
          property === "position" &&
          (value === "absolute" || value === "fixed")
        ) {
          // 因为这是一个新的层，所以里面的元素要重新计算一下自己的布局位置
          updateLayoutTree(element);
          layers.push(element);
          createdNewLayer = true;
        }
      });
    }
  });
  return createdNewLayer;
}

/**
 * 计算布局树上每个元素的布局信息
 * @param {*} element 节点元素
 * @param {*} top 自己距离自己父节点的顶部的距离
 * @param {*} parentTop 父节点距离顶部的距离
 */
function updateLayoutTree(element, top = 0, parentTop = 0) {
  const computedStyle = element.computedStyle;
  element.layout = {
    top: top + parentTop, //0
    left: 0,
    width: computedStyle.width,
    height: computedStyle.height,
    color: computedStyle.color,
    background: computedStyle.background,
  };
  let childTop = 0;
  element.children.forEach((child) => {
    updateLayoutTree(child, childTop, element.layout.top); // 0 0
    childTop += parseFloat(child.computedStyle.height || 0); //childTop= 50
  });
}

/**
 * 创建布局树
 * @param {*} element 节点元素
 * @returns
 */
function createLayoutTree(element) {
  element.children = element.children.filter(isShow);
  element.children.forEach(createLayoutTree);
  return element;
}

/**
 * 判断该节点元素是否要展示在布局树上
 * @param {*} element 节点元素
 * @returns
 */
function isShow(element) {
  let show = true; //默认都显示
  // 这些标签元素不展示在布局树上
  const notShowElementTagList = ["head", "script", "link"];
  if (notShowElementTagList.includes(element.tagName)) {
    show = false;
  }
  const attributes = element.attributes;
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "style") {
      const attributes = value.split(/;\s*/); //[background: green;]
      attributes.forEach((attribute) => {
        // background: green;
        const [property, value] = attribute.split(/:\s*/); //['background','green']
        // 样式：display:none; 不展示在布局树上
        if (property === "display" && value === "none") {
          show = false;
        }
      });
    }
  });
  return show;
}

/**
 * 重新计算样式
 * @param {*} cssRules css规则集
 * @param {*} element 元素节点
 * @param {*} parentStyle 父节点样式
 */
function recalculateStyle(cssRules, element, parentStyle = {}) {
  const attributes = element.attributes;
  element.computedStyle = { color: parentStyle.color || "black" }; //样式继承
  Object.entries(attributes).forEach(([key, value]) => {
    // 应用样式表
    cssRules.forEach((rule) => {
      let selector = rule.selectors[0];
      if (
        (key === "id" && selector === "#" + value) ||
        (key === "class" && selector === "." + value)
      ) {
        rule.declarations.forEach(({ property, value }) => {
          if (property) element.computedStyle[property] = value;
        });
      }
    });
    // 行内样式
    if (key === "style") {
      const attributes = value.split(/;\s*/); //[background: green;]
      attributes.forEach((attribute) => {
        // background: green;
        const [property, value] = attribute.split(/:\s*/); //['background','green']
        if (property) element.computedStyle[property] = value;
      });
    }
  });
  element.children.forEach((child) =>
    recalculateStyle(cssRules, child, element.computedStyle)
  );
}

// GPU进程负责把图片光栅化, 生成位图并保存到GPU内存里
gpu.on("raster", (tile) => {
  let bitMap = tile;
  gpu.bitMaps.push(bitMap);
});

// 1. 由主进程接收用户输入的URL地址
main.emit("request", {
  host,
  port,
  path: "/load.html",
});
