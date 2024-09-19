import {
    assertFail,
    assertTarballMissing,
    assertTarballPresent,
    assertTarballValid,
    p,
    printReport,
    suite,
    test,
} from "./utils.js"

import {packGitHubPages} from "../lib/pack/github-pages.js"
import {packNpm} from "../lib/pack/npm.js"

await suite("packGitHubPages", async() => {
    await test("cname present and allowlisted, repo match", async() => {
        await packGitHubPages(p("./package-with-cname"), "MithrilJS/infra")
        await assertTarballValid("artifact.tar", [
            "CNAME",
            "lib/",
            "lib/index.js",
            "package.json",
        ])
    })

    await test("cname present yet not allowlisted, repo match", async() => {
        await assertFail(() => packGitHubPages(p("./package-wrong-cname"), "MithrilJS/infra"))
        await assertTarballMissing("artifact.tar")
    })

    await test("cname missing, repo match", async() => {
        await packGitHubPages(p("./package-no-cname"), "MithrilJS/infra")
        await assertTarballValid("artifact.tar", [
            "lib/",
            "lib/index.js",
            "package.json",
        ])
    })

    await test("cname present and allowlisted, repo mismatch", async() => {
        await assertFail(() => packGitHubPages(p("./package-with-cname"), "MithrilJS/not-infra"))
        await assertTarballMissing("artifact.tar")
    })

    await test("cname present yet not allowlisted, repo mismatch", async() => {
        await assertFail(() => packGitHubPages(p("./package-wrong-cname"), "MithrilJS/not-infra"))
        await assertTarballMissing("artifact.tar")
    })

    await test("cname missing, repo mismatch", async() => {
        await assertFail(() => packGitHubPages(p("./package-no-cname"), "MithrilJS/not-infra"))
        await assertTarballMissing("artifact.tar")
    })
})

await suite("packNpm", async() => {
    await test("package name match, repo match", async() => {
        await packNpm(p("./package-no-cname"), "MithrilJS/infra")
        await assertTarballPresent("test-package-1.0.0.tgz")
    })

    await test("package name mismatch, repo match", async() => {
        await assertFail(() => packNpm(p("./package-wrong-npm-name"), "MithrilJS/infra"))
        await assertTarballMissing("not-test-package-1.0.0.tgz")
    })

    await test("package name match, repo mismatch", async() => {
        await assertFail(() => packNpm(p("./package-no-cname"), "MithrilJS/not-infra"))
        await assertTarballMissing("test-package-1.0.0.tgz")
    })

    await test("package name mismatch, repo mismatch", async() => {
        await assertFail(() => packNpm(p("./package-wrong-npm-name"), "MithrilJS/not-infra"))
        await assertTarballMissing("not-test-package-1.0.0.tgz")
    })
})

printReport()
