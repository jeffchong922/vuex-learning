import { forEachValue } from '../util'

/**
 * vuex 的基础数据结构
 */
export default class Module {
  constructor (rawModule, runtime) {
    /* 用来标识当前模块是否时动态注册的，静态注册不可卸载 */
    this.runtime = runtime
    /* 子模块映射表，只会保存一层 */
    this._children = Object.create(null)
    /* 模块原始数据 */
    this._rawModule = rawModule
    /* 模块状态初始化 */
    const rawState = rawModule.state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  /* 添加子模块实例 */
  addChild (key, module) {
    this._children[key] = module
  }

  /* 获取子模块实例 */
  getChild (key) {
    return this._children[key]
  }
}
