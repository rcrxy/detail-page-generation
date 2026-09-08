import fs from "node:fs/promises";
import { PNG } from "pngjs";

async function readPng(filePath) {
    return PNG.sync.read(await fs.readFile(filePath));
}

function missingSourceImages(sourceImages, specializedImages) {
    const specializedSet = new Set(specializedImages);
    return Array.from(new Set(sourceImages)).filter(source => !specializedSet.has(source));
}

export async function compareVisualSnapshots(
    source,
    specialized,
    { maxChangedPixels = 0, maxChangedPixelRatio = 0, maxChannelDelta = 0, heightTolerance = 0.01 } = {},
) {
    const sourcePng = await readPng(source.screenshotPath);
    const specializedPng = await readPng(specialized.screenshotPath);
    const samePixelDimensions = sourcePng.width === specializedPng.width && sourcePng.height === specializedPng.height;

    let changedPixels = 0;
    let observedMaxChannelDelta = 0;
    if (samePixelDimensions) {
        for (let index = 0; index < sourcePng.data.length; index += 4) {
            let pixelChanged = false;
            for (let channel = 0; channel < 4; channel += 1) {
                const delta = Math.abs(sourcePng.data[index + channel] - specializedPng.data[index + channel]);
                observedMaxChannelDelta = Math.max(observedMaxChannelDelta, delta);
                if (delta > maxChannelDelta) pixelChanged = true;
            }
            if (pixelChanged) changedPixels += 1;
        }
    }

    const totalPixels = sourcePng.width * sourcePng.height;
    const changedPixelRatio = samePixelDimensions && totalPixels ? changedPixels / totalPixels : 1;
    const missingImages = missingSourceImages(source.images, specialized.images);
    const widthMatches = Math.abs(source.width - specialized.width) <= 0.01;
    const heightMatches = Math.abs(source.height - specialized.height) <= heightTolerance;
    const textMatches = source.visibleText === specialized.visibleText;
    const pixelsPass =
        samePixelDimensions &&
        changedPixels <= maxChangedPixels &&
        changedPixelRatio <= maxChangedPixelRatio &&
        observedMaxChannelDelta <= maxChannelDelta;

    const result = {
        sourceWidth: source.width,
        sourceHeight: source.height,
        specializedWidth: specialized.width,
        specializedHeight: specialized.height,
        sourcePixelWidth: sourcePng.width,
        sourcePixelHeight: sourcePng.height,
        specializedPixelWidth: specializedPng.width,
        specializedPixelHeight: specializedPng.height,
        visibleTextMatches: textMatches,
        missingSourceImages: missingImages,
        changedPixels,
        changedPixelRatio,
        maxChannelDelta: observedMaxChannelDelta,
        thresholds: {
            maxChangedPixels,
            maxChangedPixelRatio,
            maxChannelDelta,
            heightTolerance,
        },
        pass: widthMatches && heightMatches && textMatches && missingImages.length === 0 && pixelsPass,
    };

    result.failures = [];
    if (!widthMatches) result.failures.push("root width mismatch");
    if (!heightMatches) result.failures.push("root height mismatch");
    if (!textMatches) result.failures.push("visible text mismatch");
    if (missingImages.length) result.failures.push("source image inventory mismatch");
    if (!samePixelDimensions) result.failures.push("screenshot pixel dimensions mismatch");
    else if (!pixelsPass) result.failures.push("pixel diff exceeds thresholds");

    return result;
}
