import * as fs from "node:fs/promises"
import * as path from "node:path"
import {fileURLToPath} from "node:url"

import commonjs from "@rollup/plugin-commonjs"
import json from "@rollup/plugin-json"
import nodeResolve from "@rollup/plugin-node-resolve"

const root = path.dirname(fileURLToPath(import.meta.url))
const names = await fs.readdir(path.resolve(root, "lib/entry"))

export default names.map((name) => ({
    input: path.resolve(root, "lib/entry", name),
    output: {
        format: "esm",
        file: path.resolve(root, "dist", name),
        inlineDynamicImports: true,
    },
    external: /^node:/,
    plugins: [json(), commonjs(), nodeResolve()]
}))
