import cloneKeys, { flatten, iterateOverObject } from "circ-clone"
import { encode, decode } from "../../app/src/serialize"
import { parse, stringify } from "circ-json"



const inp = {lel: {lol: 2, u2: undefined}, q: "333a", u: undefined, u2: undefined, circ2: {} }
// @ts-ignore
inp.rec = inp
// @ts-ignore
inp.circ2.yay = inp.lel

const enc = encode(inp)
console.log("enc", enc)
console.log("dec", decode(enc))



console.log("json", encode(stringify(inp)).byteLength)
