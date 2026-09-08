import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { captureRootSnapshot, openRenderSession } from "./browser.mjs";
import { extractScene } from "./extract.mjs";
import { generateJsx, makeScenePortable } from "./generate-jsx.mjs";
import { validateSpecializedPage } from "./protocol.mjs";
import { compareVisualSnapshots } from "./visual-gate.mjs";

function usage() {
    console.log(`
html-to-ps 0.1.0

Usage:
    node src/build.mjs --source <html-or-url> --specialized <html-or-url> [options]

Options:
    --source <value>         Approved source HTML file or URL
    --specialized <value>    Photoshop-specialized HTML file or URL
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
        const nextValue = () => {
            const value = argv[++i];
            if (!value || value.startsWith("--")) {
                throw new Error(`${arg} requires a value.`);
            }
            return value;
        };
        switch (arg) {
            case "--source":
                args.source = nextValue();
                break;
            case "--specialized":
                args.specialized = nextValue();
                break;
            case "--out":
                args.outputDir = path.resolve(nextValue());
                break;
            case "--root":
                args.rootSelector = nextValue();
                break;
            case "--name":
                args.documentName = nextValue();
                break;
            case "--initial-height":
                args.initialHeight = Number(nextValue());
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
    if (!args.source || !args.specialized) {
        usage();
        throw new Error("--source and --specialized are required.");
    }
    const sourceIdentity = /^https?:|^file:/i.test(args.source) ? args.source : path.resolve(args.source);
    const specializedIdentity = /^https?:|^file:/i.test(args.specialized) ? args.specialized : path.resolve(args.specialized);
    if (sourceIdentity.toLowerCase() === specializedIdentity.toLowerCase()) {
        throw new Error("--source and --specialized must identify different files.");
    }
    if (!Number.isFinite(args.initialHeight) || args.initialHeight <= 0) {
        throw new Error("--initial-height must be a positive number.");
    }

    const scenePath = path.join(args.outputDir, "scene.json");
    const jsxPath = path.join(args.outputDir, "build-detail-page.jsx");
    const reportPath = path.join(args.outputDir, "handoff-report.txt");
    const sourceReferencePath = path.join(args.outputDir, "source-reference.png");
    const specializedReferencePath = path.join(args.outputDir, "specialized-reference.png");
    const visualValidationPath = path.join(args.outputDir, "visual-validation.json");

    await fs.mkdir(args.outputDir, { recursive: true });
    await Promise.all([
        fs.rm(scenePath, { force: true }),
        fs.rm(jsxPath, { force: true }),
        fs.rm(reportPath, { force: true }),
        fs.rm(sourceReferencePath, { force: true }),
        fs.rm(specializedReferencePath, { force: true }),
        fs.rm(visualValidationPath, { force: true }),
        fs.rm(path.join(args.outputDir, "assets"), { recursive: true, force: true }),
        fs.rm(path.join(args.outputDir, "fallback"), { recursive: true, force: true }),
    ]);

    console.log("[1/4] Rendering source and specialized documents...");
    const session = await openRenderSession({
        source: args.source,
        specialized: args.specialized,
        headless: args.headless,
    });

    let scene;
    try {
        const specialization = await validateSpecializedPage(session.specializedPage, {
            rootSelector: args.rootSelector,
        });
        const sourceDigest = crypto
            .createHash("sha256")
            .update(await session.sourcePage.content())
            .digest("hex");
        const [sourceSnapshot, specializedSnapshot] = await Promise.all([
            captureRootSnapshot(session.sourcePage, {
                rootSelector: args.rootSelector,
                screenshotPath: sourceReferencePath,
            }),
            captureRootSnapshot(session.specializedPage, {
                rootSelector: args.rootSelector,
                screenshotPath: specializedReferencePath,
            }),
        ]);

        console.log("[2/4] Running source-to-specialized Visual Gate...");
        const visualValidation = await compareVisualSnapshots(sourceSnapshot, specializedSnapshot);
        await fs.writeFile(visualValidationPath, JSON.stringify(visualValidation, null, 2), "utf8");
        if (!visualValidation.pass) {
            throw new Error(
                `Visual Gate failed: ${visualValidation.failures.join(", ")}. ` +
                    `See ${visualValidationPath}. Modify only the specialized HTML.`,
            );
        }

        console.log("[3/4] Extracting the validated specialized scene...");
        const extractedScene = await extractScene({
            page: session.specializedPage,
            outputDir: args.outputDir,
            rootSelector: args.rootSelector,
            headless: args.headless,
        });
        extractedScene.specialization = {
            protocolVersion: specialization.protocolVersion,
            requiredCapabilities: specialization.requiredCapabilities,
            sourceDigest,
            visualValidation: {
                pass: true,
                reportPath: visualValidationPath,
            },
        };
        extractedScene.approvedReferenceImage = sourceReferencePath;
        extractedScene.specializedReferenceImage = specializedReferencePath;
        extractedScene.referenceImage = sourceReferencePath;
        scene = makeScenePortable(extractedScene, args.outputDir);
        await fs.writeFile(scenePath, JSON.stringify(scene, null, 2), "utf8");
    } finally {
        await session.browser.close();
    }

    console.log("[4/4] Generating one-time Photoshop ExtendScript...");
    await generateJsx({
        scene,
        jsxPath,
        reportPath,
        documentName: args.documentName,
        initialHeight: args.initialHeight,
    });

    console.log("Handoff package ready.");
    console.log(`  scene:     ${scenePath}`);
    console.log(`  approved:  ${scene.approvedReferenceImage}`);
    console.log(`  validated: ${visualValidationPath}`);
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
