
/**
 * 遍历对象值
 * @param {Record<string, any>} obj 
 * @param {(val: any, key: string) => void} fn 回调函数
 */
export function forEachValue (obj, fn) {
  Object.keys(obj).forEach(key => fn(obj[key], key))
}