/**
 * GPU进程：用来实现 CSS3 和 3D 效果
 */
const EventEmitter = require("events");
class GPU extends EventEmitter {
  constructor() {
    super();
    //我们最张会把生成的位图保存在GPU内存里
    this.bitMaps = [];
  }
}
const gpu = new GPU();
module.exports = gpu;
