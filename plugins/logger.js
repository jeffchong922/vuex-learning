// Credits: borrowed code from fcomb/redux-logger

import { deepCopy } from '../util'

export default function createLogger ({
  collapsed = true,
  filter = (mutation, stateBefore, stateAfter) => true,
  transformer = state => state,
  mutationTransformer = mut => mut,
  actionFilter = (action, state) => true,
  actionTransformer = act => act,
  logMutations = true,
  logActions = true,
  logger = console
} = {}) {
  /* 返回一个方法，使用方式为 { plugins: [createLogger()] } */
  return store => {
    /* 保存当前值 */
    let prevState = deepCopy(store.state)

    if (logMutations) {
      /* 订阅 commit */
      store.subscribe((mutation, state) => {
        /* 最新值 */
        const nextState = deepCopy(state)

        /* 然后就是打印操作 */
        if (filter(mutation, prevState, nextState)) {
          const formattedTime = getFormattedTime()
          const formattedMutation = mutationTransformer(mutation)
          const message = `mutation ${mutation.type}${formattedTime}`

          startMessage(logger, message, collapsed)
          logger.log('%c prev state', 'color: #9E9E9E; font-weight: bold', transformer(prevState))
          logger.log('%c mutation', 'color: #03A9F4; font-weight: bold', formattedMutation)
          logger.log('%c next state', 'color: #4CAF50; font-weight: bold', transformer(nextState))
          endMessage(logger)
        }

        /* 覆盖当前值 */
        prevState = nextState
      })
    }

    if (logActions) {
      /* 订阅 dispatch */
      store.subscribeAction((action, state) => {
        if (actionFilter(action, state)) {
          const formattedTime = getFormattedTime()
          const formattedAction = actionTransformer(action)
          const message = `action ${action.type}${formattedTime}`

          startMessage(logger, message, collapsed)
          logger.log('%c action', 'color: #03A9F4; font-weight: bold', formattedAction)
          endMessage(logger)
        }
      })
    }
  }
}

/* 以下函数自行浏览，因为不涉及主线任务 */

function startMessage (logger, message, collapsed) {
  const startMessage = collapsed
    ? logger.groupCollapsed
    : logger.group

  // render
  try {
    startMessage.call(logger, message)
  } catch (e) {
    logger.log(message)
  }
}

function endMessage (logger) {
  try {
    logger.groupEnd()
  } catch (e) {
    logger.log('—— log end ——')
  }
}

function getFormattedTime () {
  const time = new Date()
  return ` @ ${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`
}

function repeat (str, times) {
  return (new Array(times + 1)).join(str)
}

function pad (num, maxLength) {
  return repeat('0', maxLength - num.toString().length) + num
}
