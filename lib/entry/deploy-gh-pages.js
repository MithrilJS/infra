import * as path from "node:path"
import {once} from "node:events"
import {spawn} from "node:child_process"

import {fail, run} from "../util.js"
import {performDeployment} from "../api-client.js"

run(async () => {
    const artifactFile = path.join(process.env.RUNNER_TEMP, "artifact.tar")

    // Switch to GNU tar instead of the default bsdtar so I can use for `--hard-dereference`.
    const tarCmd = process.platform === "darwin" ? "gtar" : "tar"
    const tarArgs = [
        "--dereference", "--hard-dereference",
        "--directory", process.env.INPUT_PATH,
        "-cvf", artifactFile,
        "--exclude=.git",
        "--exclude=.github",
        ...(process.platform === "win32" ? ["--force-local"] : []),
        ".",
    ]

    console.log("::group::Archive artifact")
    const tarProcess = spawn(tarCmd, tarArgs)
    await once(tarProcess, "exit")

    if (tarProcess.exitCode) {
        fail(`::error::\`tar\` extraction failed with code ${tarProcess.exitCode}.`)
    }

    if (tarProcess.signalCode) {
        fail(`::error::\`tar\` extraction failed with signal ${tarProcess.signalCode}.`)
    }

    console.log("::endgroup::")

    await performDeployment(artifactFile, "github-pages", "github-pages", "artifact.tar")
})
