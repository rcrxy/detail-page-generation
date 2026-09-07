import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { extractScene } from "../src/extract.mjs";
import { generateJsx, makeScenePortable } from "../src/generate-jsx.mjs";

function findNode(nodes, predicate) {
    for (const node of Array.isArray(nodes) ? nodes : []) {
        if (predicate(node)) return node;
        const child = findNode(node.children, predicate);
        if (child) return child;
    }
    return null;
}

const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "html-to-ps-visual-"));
const inputPath = path.join(workDir, "index.html");
const outputDir = path.join(workDir, "output");

try {
    await fs.writeFile(
        inputPath,
        `<!doctype html>
<html>
<head>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    .cross {
      position: absolute;
      left: 600px;
            top: 1220px;
      width: 120px;
      height: 3px;
      background: #fff;
    }
    .cross::after {
      content: "";
      position: absolute;
      left: 58px;
      top: -58px;
      width: 3px;
      height: 120px;
      background: #fff;
    }
  </style>
</head>
<body>
<main id="detail-page" style="position:relative;width:1500px;height:1600px;background:#111">
    <section data-ps-group="Visual fidelity" style="position:relative;width:1500px;height:1600px">
    <p data-ps-name="Multiline" style="position:absolute;left:40px;top:20px;margin:0;font-family:Arial;font-size:48px;line-height:60px">Line one<br>Line two</p>
    <span data-ps-name="Centered grid text" style="position:absolute;left:300px;top:20px;width:200px;height:100px;display:grid;place-items:center;font-family:Arial;font-size:38px">34</span>
    <img data-ps-name="Portable image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lM3BTwAAAABJRU5ErkJggg==" style="position:absolute;left:520px;top:20px;width:20px;height:20px">
    <span class="cross" data-ps-name="Cross" data-ps-role="shape"></span>
    <span data-ps-name="Padded pill" style="position:absolute;left:40px;top:700px;padding:18px 30px;border:2px solid #fff;background:#eee;font-family:Arial;font-size:38px">居中的文字</span>
  </section>
</main>
</body>
</html>`,
        "utf8",
    );

    const scene = await extractScene({
        input: inputPath,
        outputDir,
        headless: true,
    });

    const multiline = findNode(scene.sections, node => node.name === "Multiline");
    const centered = findNode(scene.sections, node => node.name === "Centered grid text");
    const portableImage = findNode(scene.sections, node => node.name === "Portable image");
    const cross = findNode(scene.sections, node => node.name === "Cross");

    assert.ok(multiline, "multiline text must be extracted");
    assert.equal(multiline.text.contents, "Line one\nLine two");

    assert.ok(centered, "grid-aligned text must be extracted");
    assert.equal(centered.text.mode, "point");
    assert.ok(centered.bounds.width < 100, "grid text bounds should measure glyphs, not the 200px container");
    assert.ok(centered.bounds.x > 300, "grid text should retain its browser-centered x position");
    assert.ok(centered.bounds.y > 20, "grid text should retain its browser-centered y position");

    assert.ok(cross, "pseudo-element shape must be extracted");
    assert.equal(cross.type, "raster");
    assert.equal(cross.mode, "smart");
    assert.ok(cross.bounds.height > 120, "pseudo-element fallback bounds must extend beyond the 3px host");
    assert.ok(cross.rasterPath, "pseudo-element fallback must produce a raster asset");

    const pill = findNode(scene.sections, node => node.name === "Padded pill");
    const pillBackdrop = findNode(scene.sections, node => node.name === "Padded pill - Backdrop");
    assert.ok(pill, "padded box label must stay a native text node");
    assert.equal(pill.type, "text");
    assert.ok(pillBackdrop, "padded box label border/background must be captured as a backdrop");
    assert.equal(pillBackdrop.type, "raster");
    assert.ok(
        pill.bounds.x >= pillBackdrop.bounds.x + 20,
        "point text must be inset from the padded box border so it stays centered inside it",
    );
    assert.ok(
        pill.bounds.width <= pillBackdrop.bounds.width - 20,
        "point text bounds must measure the text run, not the full padded box",
    );

    const portableScene = makeScenePortable(scene, outputDir);
    const packagedImage = findNode(portableScene.sections, node => node.name === "Portable image");
    assert.equal(portableScene.referenceImage, "reference.png");
    assert.ok(portableImage?.image?.assetPath, "test image must be materialized into the package");
    assert.match(packagedImage.image.assetPath, /^assets\//);
    assert.equal(packagedImage.image.src, packagedImage.image.assetPath);
    assert.match(portableScene.sections[0].children.find(node => node.name === "Cross").rasterPath, /^fallback\//);

    const jsxPath = path.join(outputDir, "build.jsx");
    await generateJsx({
        scene,
        jsxPath,
        reportPath: path.join(outputDir, "report.txt"),
        documentName: "visual-fidelity-test",
        initialHeight: 100,
    });

    const jsx = await fs.readFile(jsxPath, "utf8");
    assert.ok(
        jsx.includes('"contents":"Line one\\rLine two"'),
        "generated JSX scene must use Photoshop carriage returns for multiline text",
    );
    assert.doesNotMatch(
        jsx,
        /"(?:referenceImage|src|assetPath|rasterPath)":"(?:file:\/\/\/|[A-Za-z]:[\\/]|\\\\)/,
        "generated JSX resource fields must not contain absolute paths",
    );
    assert.match(jsx, /var REPORT_PATH = "report\.txt";/);
    assert.match(jsx, /var PACKAGE_DIR = new File\(\$\.fileName\)\.parent;/);
    assert.match(
        jsx,
        /isAbsolutePackagePath|new RegExp\(|indexOf\(/,
        "generated JSX path detection must avoid fragile regex literals that Photoshop rejects",
    );
    assert.doesNotMatch(
        jsx,
        /"\\"(?!")/,
        "generated JSX must not contain a backslash that escapes a closing quote (unterminated string constant)",
    );
    assert.ok(!jsx.includes("/^//.test(value)"), "generated JSX must not contain an unterminated regex");
    assert.match(jsx, /"rasterPath":"fallback\//);

    const png = await fs.readFile(cross.rasterPath);
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const opaqueBounds = await page.evaluate(
            async dataUrl => {
                const image = new Image();
                image.src = dataUrl;
                await image.decode();

                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0);

                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let minY = canvas.height;
                let maxY = -1;
                for (let y = 0; y < canvas.height; y += 1) {
                    for (let x = 0; x < canvas.width; x += 1) {
                        if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
                            minY = Math.min(minY, y);
                            maxY = Math.max(maxY, y);
                        }
                    }
                }
                return { height: maxY >= minY ? maxY - minY + 1 : 0 };
            },
            `data:image/png;base64,${png.toString("base64")}`,
        );

        assert.ok(opaqueBounds.height >= 120, "captured fallback must contain the full vertical pseudo-element");
    } finally {
        await browser.close();
    }

    assert.deepEqual(scene.warnings, []);
    console.log("visual fidelity: ok");
} finally {
    await fs.rm(workDir, { recursive: true, force: true });
}
