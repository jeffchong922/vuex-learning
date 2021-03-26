import { Store, install } from './store'

/**
 * Vue.use() 用于使用插件，源码：
 
    Vue.use = function (plugin: Function | Object) {

      // this._installPlugins 维护已安装的插件，确保单个插件只会注册一次

      const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
      
      // 如果插件已存在，则退出

      if (installedPlugins.indexOf(plugin) > -1) {
        return this
      }


      // 第一个参数为插件本身，之后的参数视为插件可能需要的参数

      const args = toArray(arguments, 1)

      // 将 vue 传入数组，是为了方便插件获取 vue，从而避免插件为了使用 vue 而增加源码大小，也方便插件操作
      // 也就是说在安装时，插件至少能获取一个参数 vue

      args.unshift(this)

      // 从这里也可以了解，如果想要自定义 vue 插件，需要为插件提供 install 方法

      if (typeof plugin.install === 'function') {
        plugin.install.apply(plugin, args)
      } else if (typeof plugin === 'function') {
        plugin.apply(null, args)
      }
      
      // 向维护数组添加已安装插件

      installedPlugins.push(plugin)
      return this
    }

 */

/**
 * 所以 vue 插件都会提供 install
 */
export default {
  Store,
  install
}
export {
  Store,
  install
}
