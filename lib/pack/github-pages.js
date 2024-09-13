import * as path from "node:path"
import {open, readFile, readdir} from "node:fs/promises"

import {fail, reportRunError} from "../util.js"
import {TarBuilder} from "../tar-builder.js"

export async function packGitHubPages(rootDir) {
    console.log("Creating asset archive")

    const artifactFile = path.resolve(process.env.RUNNER_TEMP, "artifact.tar")
    const artifactHandle = await open(artifactFile, "wx")
    const tar = new TarBuilder()

    try {
        const normalize = (file) => path.relative(rootDir, file).replaceAll("\\", "/")

        const visit = async(parent, name) => {
            const file = path.join(parent, name)

            try {
                tar.emitFile(normalize(file), await readFile(file))
                return
            } catch (e) {
                if (e.code === "ENOENT") throw e
                if (e.code !== "EISDIR") return
            }

            try {
                const entries = await readdir(file)
                if (entries.length === 0) return
                tar.emitDirectory(normalize(file))
                for (const child of entries) {
                    await visit(file, child)
                }
            } catch (e) {
                if (e.code !== "ENOENT") throw e
            }
        }

        for (const child of await readdir(rootDir)) {
            await visit(rootDir, child)
        }
    } catch (e) {
        reportRunError("Tarball generation failed.")
        fail(e)
    }

    await artifactHandle.writeFile(tar.read())
    console.log("Asset archive generated")
}
