import cloneKeys, { iterateOverObject, pluck, findShortestPathToPrimitive } from "circ-clone"
import { incUIDScope } from "key-index"
import { encode as msgPckEncode, decode as msgPckDecode, Codec } from "tiny-msgpack"



const codec = new Codec();

const getUID = incUIDScope()
const registeredTypes = new Set<number>()

type SupportedObject = {[key: string]: SupportedTypes | SupportedObject} | (SupportedTypes | SupportedObject)[]
type SupportedTypes = number | bigint | string | boolean | null | SupportedObject | Uint8Array | Buffer
function register<T, R extends SupportedTypes>(type: {new(...a: any[]): T}, encode: (a: T) => R, decode: (a: R) => T, uid?: number) {
  if (uid === undefined) {
    do uid = Number(getUID())
    while(registeredTypes.has(uid))
  }
  else if (registeredTypes.has(uid)) throw new Error("uid already registered")
  registeredTypes.add(uid)
  codec.register(uid, type, (toBeEncoded: T) => msgPckEncode(encode(toBeEncoded)), (toBeDecoded: SupportedObject) => decode(msgPckDecode(toBeDecoded)))
}




class CircRef {constructor(public path: string[]) {}}
register(CircRef, (circRef) => circRef.path, (path) => new CircRef(path))
class Undefined {}
register(Undefined, () => null, () => new Undefined())

export function encode(_payload: unknown) {
  let payload = cloneKeys(_payload)
  const circPaths = iterateOverObject(payload, true)

  for (const {circ, keyChain, val} of circPaths) {
    if (circ) payload = pluck(payload, keyChain, new CircRef(circ))
    else if (val === undefined) payload = pluck(payload, keyChain, new Undefined())
  }
  return msgPckEncode(payload, codec)
} 


const isInstanceOf = (Cls: any) => (a: unknown) => a instanceof Cls
const isCircRef = isInstanceOf(CircRef)
const isUndefined = isInstanceOf(Undefined)


export function decode(binary: Uint8Array) {
  let payload = msgPckDecode(binary, codec) as unknown
  const deflateCircRef = (a: CircRef) => {
    return pluck(payload, a.path)
  }
  
  const circPaths = findShortestPathToPrimitive(payload, isCircRef)
  
  
  for (const keyChain of circPaths) {
    console.log(keyChain)
    payload = pluck(payload, keyChain, deflateCircRef as (a: unknown) => unknown, true)
  }
  const undefPaths = findShortestPathToPrimitive(payload, isUndefined)
  for (const keyChain of undefPaths) payload = pluck(payload, keyChain, () => undefined, true)

  return payload
}






