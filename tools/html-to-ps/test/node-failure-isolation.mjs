import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractScene } from "../src/extract.mjs";
import { generateJsx } from "../src/generate-jsx.mjs";

const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "html-to-ps-isolation-"));
const inputPath = path.join(workDir, "index.html");
const outputDir = path.join(workDir, "output");
const missingImage = pathToFileURL(path.join(workDir, "missing.png")).href;

try {
    await fs.writeFile(
        inputPath,
        `<!doctype html>
<html><body style="margin:0">
<main id="detail-page" style="position:relative;width:1500px;height:600px">
  <section data-ps-group="Fault isolation" style="position:relative;width:1500px;height:600px">
    <img data-ps-name="Broken asset" src="${missingImage}" style="position:absolute;left:0;top:0;width:200px;height:200px">
    <p data-ps-name="Surviving text" style="position:absolute;left:240px;top:20px;margin:0;font-family:Arial;font-size:48px;line-height:60px">Still converted</p>
  </section>
</main>
</body></html>`,
        "utf8",
    );

    const scene = await extractScene({
        input: inputPath,
        outputDir,
        headless: true,
        validateProtocol: false,
    });

    const section = scene.sections[0];
    const broken = section.children.find(node => node.name === "Broken asset");
    const survivor = section.children.find(node => node.name === "Surviving text");

    assert.ok(broken, "the failing element must remain represented in the scene");
    assert.equal(broken.type, "raster", "a failed image asset should degrade locally to raster fallback");
    assert.equal(broken.mode, "smart", "a successful local fallback should remain importable");
    assert.ok(survivor, "a later sibling must still be extracted");
    assert.equal(survivor.type, "text");
    assert.match(broken.locator, /img/);
    assert.ok(
        scene.warnings.some(message => message.includes('section "Fault isolation"') && message.includes("Broken asset")),
        "the extraction warning must identify its section and element",
    );

    const jsxPath = path.join(outputDir, "build.jsx");
    await generateJsx({
        scene,
        jsxPath,
        reportPath: path.join(outputDir, "report.txt"),
        documentName: "isolation-test",
        initialHeight: 100,
    });

    const jsx = await fs.readFile(jsxPath, "utf8");
    assert.match(jsx, /function nodeContext\(node, sectionName\)/);
    assert.match(jsx, /Section processing failed; continuing with the next section/);
    assert.match(jsx, /children will be created in the parent group/);
    assert.match(jsx, /createNode\(children\[i\], group \|\| parentGroup, sectionName, childFontFamily\)/);
    assert.doesNotMatch(
        jsx,
        /"(?:referenceImage|src|assetPath|rasterPath)":"(?:file:\/\/\/|[A-Za-z]:[\\/]|\\\\)/,
        "generated JSX resource fields must not contain absolute paths",
    );
    assert.match(jsx, /"rasterPath":"fallback\//);

    console.log("node failure isolation: ok");
} finally {
    await fs.rm(workDir, { recursive: true, force: true });
}
