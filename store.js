import applyMixin from './mixin'
import ModuleCollection from './module/module-collection'
import { isObject, isPromise } from './util'

let Vue

export class Store {
  constructor (options = {}) {
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    /* 当前是否在修改 state，严格模式用 */
    this._committing = false
    /* 所有模块的 action 映射表，key 为命名空间字符串 + action 名称，val 为数组 */
    this._actions = Object.create(null)
    /* 所有模块的 mutation 映射表，key 为命名空间字符串 + mutation 名称，val 为数组 */
    this._mutations = Object.create(null)
    /* 所有模块的 getter 映射表，key 为命名空间字符串 + getter 名称，val 为函数 */
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options)
    /* 启用命名空间的模块实例映射表 */
    this._modulesNamespaceMap = Object.create(null)
    /* 保存启用命名空间的模块的getters */
    this._makeLocalGettersCache = Object.create(null)
    
    /* 其实也是 options.state 初始化后 */
    const state = this._modules.root.state

    /* 模块实例的安装，就是往各私有属性拼命添加相关函数 */
    installModule(this, state, [], this._modules.root)
  }

  /**
   * 通知正在提交中
   * @param {(...args) => void} fn 
   */
  _withCommit (fn) {
    /* 保存之前的值 */
    const committing = this._committing
    this._committing = true
    /* 执行回调 */
    fn()
    /* 恢复之前的值 */
    this._committing = committing
  }
}

/**
 * 
 * @param {Store} store vuex 实例
 * @param {object} rootState 根模块实例状态
 * @param {string[]} path path 中的一项为 modules 对象的 key 值
 * @param {Module} module 模块实例
 * @param {boolean} hot
 */
function installModule (store, rootState, path, module, hot) {
  /* 是否是根模块实例 */
  const isRoot = !path.length
  /** 
   * 获取模块实例的命名空间字符串，如果祖先模块及自身未启用，默认 ''
   *  否则有如：'a/'、'b/'、'c/a/' 的字符串
   *  如果某个子模块配置 namespaced，那么该子模块的命名空间肯定带有相关 path
   */
  const namespace = store._modules.getNamespace(path)

  if (module.namespaced) {
    /* 将当前模块实例添加进相应映射表，注意 modules 的取名，避免嵌套模块覆盖的情况 */
    store._modulesNamespaceMap[namespace] = module
  }

  if (!isRoot && !hot) {
    /* 从根状态，一层一层找，找到相应的父级状态对象 */
    const parentState = getNestedState(rootState, path.slice(0, -1))
    /* key 值 */
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      /**
       * 将当前模块实例的状态添加到父模块实例的状态上，并且是对 vue 响应式的
       *  最终，rootState 又是一颗树
       *  注意模块名与状态名不要发生冲突
       */
      Vue.set(parentState, moduleName, module.state)
    })
  }

  /* 为当前模块实例增添属性 context */
  /* 查看 makeLocalContext 函数前，先查看下面的各配置注册 */
  const local = module.context = makeLocalContext(store, namespace, path)

  /* 遍历注册模块实例的所有 mutation */
  module.forEachMutation((mutation, key) => {
    /* 如果启用命名空间，则 a/increment */
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  /* 遍历注册模块实例的所有 action */
  module.forEachAction((action, key) => {
    /**
     * action 可以是对象也可以是函数：
     *  actions: {
     *    increment () {
     *    },
     *    objAction: {
     *      root: boolean // 是否是根模块的 action
     *      handler () {}
     *    }
     *  }
     */
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  /* 遍历注册模块实例的所有 getter */
  module.forEachGetter((getter, key) => {
    /* 如果启用命名空间，则 a/someVal */
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  module.forEachChild((child, key) => {
    /* 与收集模块一样，深度优先安装所有子模块实例 */
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * makeLocalContext 是为了简便一件事！！！！！！！
 *  由于 mutations、actions、getters 都在添加进 _mutations、_actions、_wrappedGetters 之前
 *    以 namespace + key 作为区分，vuex 在实际调用相关函数时，其实访问的就是 _mutations、_actions、_wrappedGetters，
 *  所以如果在开发中，我们在某个子模块的 actions 提交 commit 时：
 *  actions: {
 *    increment ({ commit }) {
 *      commit('moduleA/childA/cChildA/...', payload)
 *    }
 *  }
 * 这显然是非常恐怖的，所以为了简便此事，使用该函数创建一个 local 对象
 * @param {Store} store vuex 实例
 * @param {string} namespace 命名空间字符串
 * @param {string[]} path 当前模块路径
 * @returns 
 */
function makeLocalContext (store, namespace, path) {
  /* 检查是否启用了命名空间，父模块启用时，当前 namespace 不为空字符串 */
  const noNamespace = namespace === ''

  /* unifyObjectStyle 只是判断 _type 是否为对象，做一些判断，返回值还是 {type, payload, option} */

  /* local 重新包装了 dispatch 和 commit */
  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      /* options 可以让我们指定是否为根模块的调用 */
      if (!options || !options.root) {
        /* 这里就是关键的地方，拼接命名空间字符串 */
        type = namespace + type
      }

      return store.dispatch(type, payload)
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      /* options 可以让我们指定是否为根模块的调用 */
      if (!options || !options.root) {
        /* 这里就是关键的地方，拼接命名空间字符串 */
        type = namespace + type
      }

      store.commit(type, payload, options)
    }
  }

  /**
   * 对 getters 和 state 懒加载处理，因为 state，getters 最后是放在某个 Vue 实例里的，
   *  他们的更新是通过 vue 进行的
   */
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}

/* 获取相关 getters */
function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    const splitPos = namespace.length
    /* 遍历过后，getters 就是当前 namespace 的 getters 的代理对象 */
    Object.keys(store.getters).forEach(type => {
      /* 跳过不是当前命名空间下的 */
      if (type.slice(0, splitPos) !== namespace) return

      /* 获取 key 值 */
      const localType = type.slice(splitPos)

      /* 这里也是做了懒加载处理 */
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    /* 加入缓存 */
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  return store._makeLocalGettersCache[namespace]
}

/**
 * @param {Store} store vuex 实例
 * @param {string} type mutation 类型
 * @param {function} handler 
 * @param {object} local 
 */
function registerMutation (store, type, handler, local) {
  /* 获取相对应的集合，相同类型会存放在一起 */
  const entry = store._mutations[type] || (store._mutations[type] = [])
  entry.push(function wrappedMutationHandler (payload) {
    /**
     * 规定了 mutation 需为函数
     * mutations: {
     *  increment (state, payload) {
     *    state.key = payload
     *  }
     * }
     */
    handler.call(store, local.state, payload)
  })
}

/**
 * @param {Store} store vuex 实例
 * @param {string} type action 类型
 * @param {function} handler 
 * @param {object} local 
 */
function registerAction (store, type, handler, local) {
  /* 获取相对应的集合，相同类型会存放在一起 */
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler (payload) {
    /**
     * actions: {
     *    increment (context) {
     *      context.dispatch
     *      context.commit
     *      context.getters
     *      context.state // 非常不建议这里修改，不好追踪变化
     *      context.rootGetters
     *      context.rootState
     *    }
     * }
     */
    /* action 函数调用的结果 */
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)

    /* Promise 包装 */
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    /* 返回的 res 是一个 Promise 对象 */
    return res
  })
}

/**
 * @param {Store} store vuex 实例
 * @param {string} type getter 类型
 * @param {function} rawGetter 
 * @param {*} local 
 * @returns 
 */
function registerGetter (store, type, rawGetter, local) {
  /* 注意 this._wrappedGetters 映射表只保存一次相同 type 的 getter，所以留意命名 */
  if (store._wrappedGetters[type]) {
    return
  }
  /**
   * 规定了 getter 为函数
   * getters: {
   *    someVal (state, getters, rootState, rootGetters) {
   *      return state.key
   *    }
   * }
   */
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}

/**
 * 查找嵌套的对象
 * @param {object} state 
 * @param {string[]} path 
 * @returns 
 */
function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

function unifyObjectStyle (type, payload, options) {
  /* 预防 type 是对象的情况：context.dispatch({ type: 'x' }, payload) */
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    /* 修正 */
    type = type.type
  }

  /* 这里会有个判断，判断 type 是否为字符串类型，不是则报错 */

  return { type, payload, options }
}

export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
