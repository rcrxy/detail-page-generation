import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

export function toBrowserTarget(input) {
    if (/^https?:\/\//i.test(input) || /^file:/i.test(input)) return input;
    return pathToFileURL(path.resolve(input)).href;
}

async function waitForPageAssets(page) {
    await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        await Promise.all(
            Array.from(document.images).map(image => {
                if (image.complete) return Promise.resolve();
                return new Promise(resolve => {
                    image.addEventListener("load", resolve, { once: true });
                    image.addEventListener("error", resolve, { once: true });
                });
            }),
        );
    });
}

export async function openRenderSession({ source, specialized, headless = true }) {
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
        viewport: { width: 1800, height: 1200 },
        deviceScaleFactor: 1,
    });
    const sourcePage = await context.newPage();
    const specializedPage = await context.newPage();

    try {
        await Promise.all([
            sourcePage.goto(toBrowserTarget(source), { waitUntil: "networkidle" }),
            specializedPage.goto(toBrowserTarget(specialized), { waitUntil: "networkidle" }),
        ]);
        await Promise.all([waitForPageAssets(sourcePage), waitForPageAssets(specializedPage)]);
        return { browser, context, sourcePage, specializedPage };
    } catch (error) {
        await browser.close();
        throw error;
    }
}

export async function captureRootSnapshot(page, { rootSelector, screenshotPath }) {
    const roots = page.locator(rootSelector);
    const rootCount = await roots.count();
    if (rootCount !== 1) {
        throw new Error(`Expected exactly one ${rootSelector}; found ${rootCount}.`);
    }

    const root = roots.first();
    await root.waitFor({ state: "visible" });
    const bounds = await root.boundingBox();
    if (!bounds) throw new Error(`Unable to measure ${rootSelector}.`);

    const metadata = await root.evaluate(element => {
        function normalizeText(value) {
            return String(value || "")
                .replace(/\r\n?/g, "\n")
                .replace(/[\t\f\v ]+/g, " ")
                .replace(/ *\n */g, "\n")
                .trim();
        }

        return {
            visibleText: normalizeText(element.innerText),
            images: Array.from(element.querySelectorAll("img"))
                .filter(image => {
                    const style = getComputedStyle(image);
                    const rect = image.getBoundingClientRect();
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        Number.parseFloat(style.opacity || "1") > 0 &&
                        rect.width > 0 &&
                        rect.height > 0
                    );
                })
                .map(image => {
                    const source = image.currentSrc || image.src;
                    if (!source || source.startsWith("data:")) return source;
                    try {
                        const url = new URL(source, document.baseURI);
                        return `${url.protocol}//${url.host}${decodeURIComponent(url.pathname)}`;
                    } catch {
                        return source;
                    }
                })
                .filter(Boolean),
        };
    });

    await root.screenshot({
        path: screenshotPath,
        animations: "disabled",
        caret: "hide",
    });

    return {
        width: bounds.width,
        height: bounds.height,
        screenshotPath,
        visibleText: metadata.visibleText,
        images: metadata.images,
    };
}
