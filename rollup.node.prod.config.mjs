import { merge } from "webpack-merge"
import commonMod from "./rollup.node.common.config.mjs"


export default merge(commonMod, {
  input: 'app/src/functionalAdapter.ts',
  output: {
    file: 'app/dist/cjs/functionalAdapter.js',
    format: 'cjs'
  },
})