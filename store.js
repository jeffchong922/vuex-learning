import applyMixin from './mixin'
import ModuleCollection from './module/module-collection'

let Vue

export class Store {
  constructor (options = {}) {
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    /* 收集所有模块，实例的 root 属性为根模块实例 */
    this._modules = new ModuleCollection(options)
  }
}

export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
