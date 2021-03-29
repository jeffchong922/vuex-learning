import applyMixin from './mixin'
import ModuleCollection from './module/module-collection'
import { isObject, isPromise } from './util'

let Vue

export class Store {
  constructor (options = {}) {
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    const {
      plugins = []
    } = options

    this._committing = false
    this._actions = Object.create(null)
    /* 保存订阅者, dispatch */
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null)
    /* 保存订阅者，commit */
    this._subscribers = []
    this._makeLocalGettersCache = Object.create(null)

    /* 重新包装 dispatch 和 commit，为了确保在函数中 this 的指向正确性 */
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundDispatch (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    const state = this._modules.root.state

    installModule(this, state, [], this._modules.root)

    resetStoreVM(this, state)

    /* plugin 是一个函数，能获取当前 vuex 实例 */
    plugins.forEach(plugin => plugin(this))
  }

  get state () {
    return this._vm._data.$$state
  }

  set state (v) {
  }

  commit (_type, _payload, _options) {
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options)

    /* 传给插件的值 */
    const mutation = { type, payload }

    const entry = this._mutations[type]
    if (!entry) {
      return
    }

    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload)
      })
    })

    /* 修改完数据后，遍历所有订阅者，并传入相关值与当前状态 */
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state))
  }

  dispatch (_type, _payload) {
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }

    const entry = this._actions[type]
    if (!entry) {
      return
    }

    try {
      /* 订阅者可以配置一个对象，用于在执行 action 之前获取相关数据 */
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
    }

    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)

    return new Promise((resolve, reject) => {
      result.then(res => {
        try {
          /* 成功执行完所有 action 之后通知订阅者 */
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state))
        } catch (e) {
        }
        resolve(res)
      }, error => {
        try {
          /* 错误的情况下，通知错误的相关函数 */
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error))
        } catch (e) {
        }
        reject(error)
      })
    })
  }

  /**
   * fn 即插件的回调函数
   */
  subscribe (fn, options) {
    /* 简单的将 fn 添加到 this._subscribers */
    return genericSubscribe(fn, this._subscribers, options)
  }

  /**
   * fn 即插件的回调函数
   */
  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers, options)
  }

  _withCommit (fn) {
    const committing = this._committing
    this._committing = true
    fn()
    this._committing = committing
  }
}

function genericSubscribe (fn, subs, options) {
  /* 检查数组是否包含当前订阅者 */
  if (subs.indexOf(fn) < 0) {
    /* 调整通知顺序 */
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn)
  }
  /* 返回用于取消订阅的函数 */
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

function resetStoreVM (store, state, hot) {
  const oldVm = store._vm

  store.getters = {}
  store._makeLocalGettersCache = Object.create(null)
  const wrappedGetters = store._wrappedGetters

  const computed = {}
  forEachValue(wrappedGetters, (fn, key) => {
    computed[key] = partial(fn, store)

    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  const silent = Vue.config.silent
  Vue.config.silent = true
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  if (oldVm) {
    if (hot) {
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}

function installModule (store, rootState, path, module, hot) {
  const isRoot = !path.length
  const namespace = store._modules.getNamespace(path)

  if (module.namespaced) {
    store._modulesNamespaceMap[namespace] = module
  }

  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      Vue.set(parentState, moduleName, module.state)
    })
  }

  const local = module.context = makeLocalContext(store, namespace, path)

  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === ''

  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
      }

      return store.dispatch(type, payload)
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
      }

      store.commit(type, payload, options)
    }
  }

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

function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
      if (type.slice(0, splitPos) !== namespace) return

      const localType = type.slice(splitPos)

      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  return store._makeLocalGettersCache[namespace]
}

function registerMutation (store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = [])
  entry.push(function wrappedMutationHandler (payload) {
    handler.call(store, local.state, payload)
  })
}

function registerAction (store, type, handler, local) {
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler (payload) {
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)

    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    return res
  })
}

function registerGetter (store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    return
  }
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}

function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  return { type, payload, options }
}

export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
