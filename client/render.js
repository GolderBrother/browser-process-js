/**
 * 渲染进程：排版引擎和 V8 引擎运行在该进程中，负责把 HTML、CSS 和 JavaScript 转变成网页
 */
const EventEmitter = require('events');
class Render extends EventEmitter { }
const render = new Render();
module.exports = render;