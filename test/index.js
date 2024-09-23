import {
    assertFail,
    assertTarballMissing,
    assertTarballPresent,
    p,
    printReport,
    suite,
    test,
} from "./utils.js"

import {packNpm} from "../lib/pack/npm.js"

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
