import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const toolDir = path.resolve(testDir, "..");
const exampleDir = path.join(toolDir, "example");
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "html-to-ps-build-gate-"));
const sourcePath = path.join(workDir, "source.html");
const specializedPath = path.join(workDir, "specialized.html");
const outputDir = path.join(workDir, "output");

try {
    await fs.copyFile(path.join(exampleDir, "source.html"), sourcePath);
    await fs.cp(path.join(exampleDir, "assets"), path.join(workDir, "assets"), { recursive: true });

    const specialized = await fs.readFile(path.join(exampleDir, "specialized.html"), "utf8");
    const shifted = specialized.replace("left: 120px; top: 130px", "left: 121px; top: 130px");
    assert.notEqual(shifted, specialized, "the fixture must introduce a 1px visual shift");
    await fs.writeFile(specializedPath, shifted, "utf8");

    const result = spawnSync(
        process.execPath,
        [path.join(toolDir, "src", "build.mjs"), "--source", sourcePath, "--specialized", specializedPath, "--out", outputDir],
        {
            encoding: "utf8",
            env: { ...process.env, NODE_OPTIONS: "" },
        },
    );

    assert.notEqual(result.status, 0, "a 1px specialized shift must fail the build");
    assert.match(`${result.stdout}\n${result.stderr}`, /Visual Gate failed/);
    assert.equal(await fs.stat(path.join(outputDir, "visual-validation.json")).then(() => true), true);
    assert.equal(
        await fs.stat(path.join(outputDir, "scene.json")).then(
            () => true,
            () => false,
        ),
        false,
    );
    assert.equal(
        await fs.stat(path.join(outputDir, "build-detail-page.jsx")).then(
            () => true,
            () => false,
        ),
        false,
    );

    console.log("build visual gate: ok");
} finally {
    await fs.rm(workDir, { recursive: true, force: true });
}
