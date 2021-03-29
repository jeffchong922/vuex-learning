import Module from './module'
import { forEachValue } from '../util'

export default class ModuleCollection {
  constructor (rawRootModule) {
    /* 注册所有模块，并为当前实例添加 root 属性 */
    this.register([], rawRootModule, false)
  }

  /**
   * 获得父级模块实例，path 长度为 0 时获得根模块实例
   * @param {string[]} path 保存 modules 的 key 值
   * @returns 
   */
  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  /**
   * 注册模块
   * @param {string[]} path 保存 modules 的 key 值
   * @param {object} rawModule 模块原始数据
   * @param {boolean} runtime 是否是动态注册模块
   */
  register (path, rawModule, runtime = true) {
    /* 获得模块实例 */
    const newModule = new Module(rawModule, runtime)
    if (path.length === 0) {
      /**
       * 根模块，即 new Vuex.Store({}) 的对象的模块实例
       *  也为当前 ModuleCollection 实例添加一个属性
       */
      this.root = newModule
    } else {
      /* 查找父级模块实例 */
      const parent = this.get(path.slice(0, -1))
      /* 父级模块实例添加子模块，只会添加一层，下下层通过查找下层获得 */
      parent.addChild(path[path.length - 1], newModule)
    }

    /**
     * 检查当前模块是否含有子模块，例如：
     *  {
     *    state: {},
     *    mutations: {},
     *    actions: {},
     *    modules: {
     *      a: { ... },
     *      b: {
     *        ...
     *        modules: { c: { ... } }
     *      }
     *    }
     *  }
     */
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        /**
         * 注意 path 是通过 concat 方法，并不会影响原数组，所以最终也会构成一棵树，可以访问 this.root 查看
         */
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }
}
