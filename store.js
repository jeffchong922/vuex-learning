import applyMixin from './mixin'

/* 保存可贵的 vue */
let Vue

export class Store {
  constructor (options = {}) {
    /**
     * 这里是针对非 npm 方式使用，即通过 <script> 引入 vuex 而做的兼容
     */
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      /* 自动调用 install */
      install(window.Vue)
    }
  }
}

export function install (_Vue) {
  /* 保存 vue，其实也是单例模式的一种实现，即使 Vue.use() 没有维护安装的插件，vuex 也会判断 */
  if (Vue && _Vue === Vue) {
    return
  }
  /* 保存 */
  Vue = _Vue
  /* 向每个组件注入 vuexInit 方法，详情查看对应函数 */
  applyMixin(Vue)
}
