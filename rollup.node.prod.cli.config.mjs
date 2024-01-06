import { merge } from "webpack-merge"
import commonMod from "./rollup.node.common.config.mjs"


export default merge(commonMod, {
  input: 'app/src/cli/functionalAdapter-cli.ts',
  output: {
    banner: "#!/usr/bin/env node",
    file: 'app/dist/cjs/cli/functionalAdapter-cli.js',
    format: 'cjs'
  },
})