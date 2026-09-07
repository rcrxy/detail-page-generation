import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { extractScene } from "./extract.mjs";
import { generateJsx, makeScenePortable } from "./generate-jsx.mjs";

function usage() {
    console.log(`
html-to-ps 0.0.1

Usage:
  node src/build.mjs --input <html-or-url> [options]

Options:
  --input <value>          HTML file or http(s) URL
  --out <dir>              Output directory (default: ./handoff-output)
  --root <selector>        Design root (default: #detail-page)
  --name <value>           Photoshop document name (default: detail-page)
  --initial-height <px>    Initial Photoshop canvas height (default: 1000)
  --no-headless            Show Chromium while extracting
  --help
`);
}

function parseArgs(argv) {
    const args = {
        outputDir: path.resolve("handoff-output"),
        rootSelector: "#detail-page",
        documentName: "detail-page",
        initialHeight: 1000,
        headless: true,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case "--input":
                args.input = argv[++i];
                break;
            case "--out":
                args.outputDir = path.resolve(argv[++i]);
                break;
            case "--root":
                args.rootSelector = argv[++i];
                break;
            case "--name":
                args.documentName = argv[++i];
                break;
            case "--initial-height":
                args.initialHeight = Number(argv[++i]);
                break;
            case "--no-headless":
                args.headless = false;
                break;
            case "--help":
            case "-h":
                args.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        usage();
        return;
    }
    if (!args.input) {
        usage();
        throw new Error("--input is required.");
    }
    if (!Number.isFinite(args.initialHeight) || args.initialHeight <= 0) {
        throw new Error("--initial-height must be a positive number.");
    }

    await fs.mkdir(args.outputDir, { recursive: true });

    console.log("[1/3] Rendering and extracting browser layout...");
    const extractedScene = await extractScene({
        input: args.input,
        outputDir: args.outputDir,
        rootSelector: args.rootSelector,
        headless: args.headless,
    });
    const scene = makeScenePortable(extractedScene, args.outputDir);

    const scenePath = path.join(args.outputDir, "scene.json");
    await fs.writeFile(scenePath, JSON.stringify(scene, null, 2), "utf8");

    console.log("[2/3] Generating one-time Photoshop ExtendScript...");
    const jsxPath = path.join(args.outputDir, "build-detail-page.jsx");
    const reportPath = path.join(args.outputDir, "handoff-report.txt");
    await generateJsx({
        scene,
        jsxPath,
        reportPath,
        documentName: args.documentName,
        initialHeight: args.initialHeight,
    });

    console.log("[3/3] Handoff package ready.");
    console.log(`  scene:     ${scenePath}`);
    console.log(`  reference: ${scene.referenceImage}`);
    console.log(`  jsx:       ${jsxPath}`);
    if (scene.warnings.length) {
        console.log(`  warnings:  ${scene.warnings.length} (also embedded into the JSX report)`);
    }
    console.log("");
    console.log("Photoshop 2024:");
    console.log("  File -> Scripts -> Browse -> build-detail-page.jsx");
}

main().catch(error => {
    console.error("");
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
});
