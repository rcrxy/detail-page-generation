import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openRenderSession } from "../src/browser.mjs";
import { extractScene } from "../src/extract.mjs";
import { generateJsx, makeScenePortable } from "../src/generate-jsx.mjs";
import { validateSpecializedPage } from "../src/protocol.mjs";

function flatten(nodes) {
    const result = [];
    for (const node of Array.isArray(nodes) ? nodes : []) {
        result.push(node, ...flatten(node.children));
    }
    return result;
}

const testDir = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(testDir, "../example");
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "html-to-ps-primitives-"));
const session = await openRenderSession({
    source: path.join(exampleDir, "source.html"),
    specialized: path.join(exampleDir, "specialized.html"),
    headless: true,
});

try {
    await validateSpecializedPage(session.specializedPage);
    const scene = await extractScene({ page: session.specializedPage, outputDir: workDir });
    const nodes = flatten(scene.sections);

    assert.equal(scene.version, "0.1.0");
    assert.ok(nodes.some(node => node.type === "text"));
    assert.ok(nodes.some(node => node.type === "image"));
    assert.ok(nodes.some(node => node.type === "raster"));
    assert.ok(nodes.some(node => node.type === "shape" && node.shape?.kind === "rectangle"));
    assert.ok(nodes.some(node => node.type === "shape" && node.shape?.kind === "ellipse"));
    assert.ok(
        nodes.every(node => node.sourceTrace?.sourceId),
        "every example scene node must preserve source trace",
    );

    scene.specialization = {
        protocolVersion: "0.1",
        requiredCapabilities: ["shape-fill", "shape-ellipse"],
        sourceDigest: "test-digest",
        visualValidation: { pass: true, reportPath: path.join(workDir, "visual-validation.json") },
    };
    scene.approvedReferenceImage = path.join(workDir, "source-reference.png");
    scene.specializedReferenceImage = path.join(workDir, "specialized-reference.png");
    scene.referenceImage = scene.approvedReferenceImage;

    const portable = makeScenePortable(scene, workDir);
    assert.equal(portable.approvedReferenceImage, "source-reference.png");
    assert.equal(portable.specializedReferenceImage, "specialized-reference.png");
    assert.equal(portable.specialization.visualValidation.reportPath, "visual-validation.json");

    const jsxPath = path.join(workDir, "build.jsx");
    await generateJsx({
        scene,
        jsxPath,
        reportPath: path.join(workDir, "report.txt"),
        documentName: "primitive-test",
        initialHeight: 100,
    });
    const jsx = await fs.readFile(jsxPath, "utf8");
    assert.match(jsx, /\[REFERENCE\] Approved Design - DO NOT EDIT/);
    assert.match(jsx, /SCENE\.approvedReferenceImage \|\| SCENE\.referenceImage/);
    assert.match(jsx, /function createNativeShape/);
    assert.match(jsx, /stringIDToTypeID\("contentLayer"\)/);
    assert.match(jsx, /shapeKind === "ellipse"/);
    assert.match(jsx, /\[source: /);
    assert.doesNotMatch(jsx, /\[REFERENCE\] Browser Render/);

    console.log("primitive extraction: ok");
} finally {
    await session.browser.close();
    await fs.rm(workDir, { recursive: true, force: true });
}
