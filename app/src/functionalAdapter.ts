import { SyncPromise } from "more-proms"
Promise = SyncPromise as any

import clone, { findShortestPathToPrimitive, pluck } from "circ-clone"
import { Adapter } from "josm-adapter"
import sani, { OBJECT, OR, NOT, AND, AWAITED, unknown, any, CONST, ensure } from "sanitize-against"
export { polyfill } from "sanitize-against"
import { incUIDScope } from "key-index"
// import * as JSON from "circ-json"


// export type WsOnFunc = (eventType: "open" | "close" | "message" | "error", cb: (data: any) => void) => void  
// export type WsSendFunc = (data: any) => void
// export type WebSocket = {on: WsOnFunc, send: WsSendFunc}
// export type WsAttachment = { ws: ((path: string, cb: (ws: {on: WsOnFunc, send: WsSendFunc}) => void) => void) }




// const asPromise = async <T>(a: T) => (await a) as T extends Promise<any> ? Awaited<T> : T
const asPromise = <T>(a: T) => a instanceof SyncPromise ? a : SyncPromise.resolve(a) as any








export function simpleFunctionBasedClient(ad: Adapter) {
  return mkRecursiveFuncProxy((f, a) => {
    ad.send({f, a})
  })
}


type FunctionTable = {[key in string]: ((...a: any[]) => unknown) | FunctionTable}
export function simpleFunctionBasedServer(a: Pick<Adapter, "onMsg">, functionTable: FunctionTable) {
  a.onMsg(({f, a}: {f: string[], a: any[]}) => {
    try {pluck(functionTable, f)(...a)}
    catch(e) {console.error(e)}
  })
}








const nestedObPrimitiveFilter = sani(new OBJECT(new AND(new NOT(new CONST(undefined)), new OR(String, Number, Boolean, (p: Promise<any>) => {
  if (p instanceof Promise) return undefined
  else throw new Error("Not a promise")
})), true, true))




type FuncT<T> = 
  T extends (...a: infer Param) => infer Ret ? 
    (...a: Param) => FuncT<Ret>
  : T extends Promise<any> ? 
    FuncT<Awaited<T>>
  : T extends object ? 
    {
      [key in keyof T]: FuncT<T[key]>
    }
  : Promise<T>



function reverseEnsure(f: Function) {
  return (...a: unknown[]) => {
    try {f(...a); return true}
    catch(e) {return false}
  }
}


function isNonPrimitive(res: unknown) {
  return (typeof res === "object" && res !== null) || res instanceof Object
}

type KeyChain = string[]


const isPromise = reverseEnsure(sani(Promise))
const isUndefined = reverseEnsure(sani(ensure(a => a === undefined)))

type FuncInp = {[key in string]: FuncInp} | string | boolean | number | ((...a: any[]) => any) | Promise<FuncInp>
export function functionBasedServer<FunctionMap extends FuncInp>(a: Adapter, functionTable: FunctionMap): FuncT<FunctionMap> {
  const fbsIndex = {}
  simpleFunctionBasedServer(a, fbsIndex)

  const client = simpleFunctionBasedClient(a)
  const nonFunctionalFunctionTable = nestedObPrimitiveFilter(functionTable)
  client.setStatic(nonFunctionalFunctionTable)

  

  const getUID = () => incUIDScope() + ""
  function functionBasedServerRec<FunctionMap extends FuncInp>(a: Adapter, functionTable: FunctionMap | Function, scope: string) {

    const allPromisePaths = findShortestPathToPrimitive(functionTable, isPromise)

    for (const _path of allPromisePaths) {

      let cur = functionTable as unknown
      for (const key of _path) {
        cur = cur[key]
      }
      const p = cur as Promise<any>

      const path = [scope, ..._path]

      p.then((res) => {
        let val: unknown
        if (isNonPrimitive(res)) {
          const scope = getUID()

          functionBasedServerRec(a, res as any, scope)

          let parsedRes: unknown
          try {parsedRes = nestedObPrimitiveFilter(res)}
          catch(e) {}
          val = parsedRes
        }
        else val = res
        client.sendPromRes({val, path, res: true})
      }).catch(e => {
        client.sendPromRes({val: e.message, path, res: false})
      })
    }



    fbsIndex[scope] = {
      callFunction({name, returnId, args}: {name: string[], returnId: number, args: unknown[]}) {
        try {
          asPromise(pluck(functionTable, name)(...args)).then((res) => {
            if (isNonPrimitive(res)) {
              const scope = getUID()
              functionBasedServerRec(a, res as any, scope)
              let parsedRes: unknown
              try {parsedRes = nestedObPrimitiveFilter(res)}
              catch(e) {}
              client.sendReturn({returnId, res: parsedRes, scope})
            }
            else {
              client.sendReturn({returnId, res})
            }
          }).catch((e) => {
            client.sendReturn({returnId, rej: e.message})
          })
        }
        catch(e) {
          
        }
      }
    }
  }

  functionBasedServerRec(a, functionTable, "")

  return {} as any
}

const saniUID = sani(String)
export function functionBasedClient(a: Adapter) {
  const server = simpleFunctionBasedClient(a)

  const callback = {
    getUID: () => incUIDScope() + "",
    table: new Map<string, {res: (a: {scope?: string, res: unknown}) => void, rej: (reason: unknown) => void}>()
  }


  function constrLocalRecFuncProx(p: {scope?: string, res: unknown} | Promise<{scope?: string, res: unknown}>) {
    return mkRecursiveFuncProxy((name, args) => {
      const returnId = callback.getUID()

      const nextProm = new Promise<{scope?: string, res: unknown}>((res, rej) => {
        callback.table.set(returnId, {res, rej})
      });
      

      asPromise(p).then((p) => {
        server[saniUID(p.scope)].callFunction({name, args, returnId})
      })
      
      return constrLocalRecFuncProx(nextProm)
    }, asPromise(p).then(({res: ob, scope}) => {
      const promises = findShortestPathToPrimitive(ob, isUndefined)

      for (const promiseKey of promises) {
        const keyAsString = JSON.stringify([scope, ...promiseKey])
        pluck(ob, promiseKey, new Promise((res, rej) => {
          promMap.set(keyAsString, {res, rej})
        }))
      }

      return ob
    }))
  }

  const promMap = new Map<string, {res: Function, rej: Function}>()

  const staticOb = new Promise<object>((res) => {
    simpleFunctionBasedServer(a, {
      sendReturn(arg: {returnId: string, res: unknown, scope?: string} | {returnId: string, rej: string}) {
        const { returnId } = arg
        const prom = callback.table.get(returnId)
        if (prom !== undefined) {
          if ("res" in arg) {
            prom.res(saniResScope(arg as {scope?: string, res: unknown}))
          }
          else prom.rej(arg.rej)
          callback.table.delete(returnId)
        }
        else console.warn(`Got answer for unknown request ${returnId}`)
      },
      setStatic(ob: object) {
        res(ob)
      },
      sendPromRes({val, path, res, scope}: {val: unknown, path: KeyChain, res: boolean, scope: string}) {
        const keyAsString = JSON.stringify(path)
        const prom = promMap.get(keyAsString)
        if (prom !== undefined) {
          prom[res ? "res" : "rej"](val)
          promMap.delete(keyAsString)
        }
        else console.warn(`Got answer for unknown request ${keyAsString}`)
      }
    })
  })



  return constrLocalRecFuncProx({scope: "", res: staticOb})
}
const saniResScope = sani({"scope?": String, res: any})
const saniString = sani(String)

function mkRecursiveFuncProxy(cb: (keyChain: KeyChain, args: unknown[]) => unknown, res: unknown | Promise<unknown> = {}, keyChain: KeyChain = []) {
  return new Proxy((...args: any[]) => {
    const lastKey = keyChain[keyChain.length - 1]
    if (lastKey === "then" || lastKey === "catch") {
      if (res instanceof Promise) return (res[lastKey] as any)(...args)
      else return undefined
    }

    return cb(keyChain, args)
  }, {
    get(target, key: string) {
      try {saniString(key)} catch(e) {return undefined}
      if (res instanceof Promise) return mkRecursiveFuncProxy(cb, res.then((res) => {
        if (res !== null && Object.hasOwn(res, key)) return res[key]
        else {
          if (key === "then" || key === "catch") return res
          console.error("Promise resolved to", res)
        }
      }), [...keyChain, key])
      else if (res !== null && typeof res === "object" && Object.hasOwn(res, key) && typeof res[key] !== "object") return res[key]
      else return mkRecursiveFuncProxy(cb, res[key], [...keyChain, key])
    }
  })
}



import delay from "tiny-delay"
import LinkedList from "fast-linked-list"

export function dummyAdapterPair() {
  // const connectingDelay = delay(10)
  const connectingDelay = SyncPromise.resolve()
  const aCbs = new LinkedList<Function>()
  const a = {
    onMsg: (cb: Function) => {
      const tok = aCbs.push(cb)
      return tok.rm.bind(tok)
    },
    send: (msg: unknown) => {
      const s = JSON.parse(JSON.stringify(msg))
      // const s = msg
      connectingDelay.then(() => {
        bCbs.forEach(cb => {cb(s)})
      })
    }
  } as Adapter

  const bCbs = new LinkedList<Function>()
  const b = {
    onMsg: (cb: Function) => {
      const tok = bCbs.push(cb)
      return tok.rm.bind(tok)
    },
    send: (msg: unknown) => {
      const s = JSON.parse(JSON.stringify(msg))
      // const s = msg
      connectingDelay.then(() => {
        aCbs.forEach(cb => {cb(s)})
      })
    }
  } as Adapter

  return {a, b}
}
