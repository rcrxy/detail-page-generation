import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { compareVisualSnapshots } from "../src/visual-gate.mjs";

const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "html-to-ps-gate-"));

function pngBuffer(pixel) {
    const png = new PNG({ width: 2, height: 2 });
    for (let index = 0; index < png.data.length; index += 4) {
        png.data[index] = pixel[0];
        png.data[index + 1] = pixel[1];
        png.data[index + 2] = pixel[2];
        png.data[index + 3] = pixel[3];
    }
    return PNG.sync.write(png);
}

try {
    const sourcePath = path.join(workDir, "source.png");
    const equalPath = path.join(workDir, "equal.png");
    const changedPath = path.join(workDir, "changed.png");
    await fs.writeFile(sourcePath, pngBuffer([10, 20, 30, 255]));
    await fs.writeFile(equalPath, pngBuffer([10, 20, 30, 255]));

    const changed = PNG.sync.read(pngBuffer([10, 20, 30, 255]));
    changed.data[0] = 11;
    await fs.writeFile(changedPath, PNG.sync.write(changed));

    const base = {
        width: 1500,
        height: 100,
        visibleText: "Approved text",
        images: ["file:///assets/product.png"],
    };

    const pass = await compareVisualSnapshots({ ...base, screenshotPath: sourcePath }, { ...base, screenshotPath: equalPath });
    assert.equal(pass.pass, true);
    assert.equal(pass.changedPixels, 0);

    const shiftedPixel = await compareVisualSnapshots(
        { ...base, screenshotPath: sourcePath },
        { ...base, screenshotPath: changedPath },
    );
    assert.equal(shiftedPixel.pass, false);
    assert.match(shiftedPixel.failures.join(" "), /pixel diff/);

    const changedText = await compareVisualSnapshots(
        { ...base, screenshotPath: sourcePath },
        { ...base, visibleText: "Changed text", screenshotPath: equalPath },
    );
    assert.equal(changedText.pass, false);
    assert.match(changedText.failures.join(" "), /visible text/);

    const replacedImage = await compareVisualSnapshots(
        { ...base, screenshotPath: sourcePath },
        { ...base, images: ["file:///assets/replacement.png"], screenshotPath: equalPath },
    );
    assert.equal(replacedImage.pass, false);
    assert.match(replacedImage.failures.join(" "), /image inventory/);

    console.log("specialization visual gate: ok");
} finally {
    await fs.rm(workDir, { recursive: true, force: true });
}
