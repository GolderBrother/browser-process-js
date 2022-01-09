/**
 * 浏览器主进程：负责界面显示、用户交互和子进程管理
 */
const EventEmitter = require("events");
class Main extends EventEmitter {}
const main = new Main();
module.exports = main;
