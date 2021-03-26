export default function (Vue) {
  /* 获取 vue 大版本号 */
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    /* 为每个组件都注入 vuexInit 函数，目的是为了初始化 vuex 或者获取 vuex 实例 */
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    /* 忽略 vue 1.x 兼容代码 */
  }

  /* 初始化 vuex 或者获取 vuex */
  function vuexInit () {
    /**
     * 获取当前组件的配置，也就是导出的配置对象
     *  export default {
     *    name: 'vueInstanceOption',
     *    template: `<div>vue</div>`
     *    data: () => ({})
     *  }
     */
    const options = this.$options
  
    /**
     * 检查配置是否存在 store 属性，通常在 vue 根实例配置
     *  const store = new Vuex.store({})
     *  new Vue({
     *    el: '#app'
     *    store
     *  })
     */
    if (options.store) {
      /* 为当前实例添加 $store 属性，指向(创建好的?) vuex 实例 */
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      /**
       * 由于 vue 组件整体属于树形结构
       *  通过类似递归的方式，可以为每个子组件都添加 $store 属性，它们(一般情况下)都指向根实例的 $store
       *  即 vuex 所说的：它采用集中式存储管理应用的 **所有组件** 的状态
       */
      this.$store = options.parent.$store
    }
  }
}
