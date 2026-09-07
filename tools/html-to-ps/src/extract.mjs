import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

function safeName(value) {
    return (
        String(value || "asset")
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 100) || "asset"
    );
}

function hash(value) {
    return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function extFromContentType(contentType) {
    const type = String(contentType || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    return (
        {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "image/svg+xml": ".svg",
            "image/avif": ".avif",
        }[type] || ".bin"
    );
}

async function materializeImage(src, outputDir, preferredName) {
    if (!src) {
        throw new Error("Image source is empty.");
    }

    const assetsDir = path.join(outputDir, "assets");
    await fs.mkdir(assetsDir, { recursive: true });

    if (src.startsWith("file:")) {
        const sourcePath = fileURLToPath(src);
        const ext = path.extname(sourcePath) || ".bin";
        const output = path.join(assetsDir, `${safeName(preferredName)}-${hash(src)}${ext}`);
        await fs.copyFile(sourcePath, output);
        return output;
    }

    if (src.startsWith("data:image/")) {
        const match = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
        if (!match) throw new Error("Unsupported data URL.");
        const contentType = match[1] || "application/octet-stream";
        const isBase64 = Boolean(match[2]);
        const payload = match[3];
        const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
        const ext = extFromContentType(contentType);
        const output = path.join(assetsDir, `${safeName(preferredName)}-${hash(src)}${ext}`);
        await fs.writeFile(output, buffer);
        return output;
    }

    if (/^https?:/i.test(src)) {
        const response = await fetch(src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} while downloading ${src}`);
        }
        const ext = path.extname(new URL(src).pathname) || extFromContentType(response.headers.get("content-type"));
        const output = path.join(assetsDir, `${safeName(preferredName)}-${hash(src)}${ext || ".bin"}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(output, buffer);
        return output;
    }

    throw new Error(`Unsupported image source protocol: ${src.slice(0, 32)}`);
}

function errorMessage(error) {
    try {
        return error?.message || String(error);
    } catch {
        return "<unknown error>";
    }
}

function walkNodes(nodes, visit, section = null, onError = null) {
    for (const node of Array.isArray(nodes) ? nodes : []) {
        const currentSection = section || node;
        try {
            visit(node, currentSection);
        } catch (error) {
            onError?.(error, node, currentSection);
        }

        try {
            if (Array.isArray(node?.children) && node.children.length) {
                walkNodes(node.children, visit, currentSection, onError);
            }
        } catch (error) {
            onError?.(error, node, currentSection);
        }
    }
}

function nodeLocation(node, section) {
    const sectionLabel = section?.name || section?.id || "<unknown section>";
    const elementLabel = node?.locator || node?.name || node?.id || "<unknown element>";
    const id = node?.id || "<no id>";
    const type = node?.type || "<unknown type>";
    return `section "${sectionLabel}" / element "${elementLabel}" / id "${id}" / type "${type}"`;
}

function pseudoCaptureBounds(node, canvas, padding = 128) {
    const reason = String(node?.fallbackReason || "");
    if (!reason.includes("::before") && !reason.includes("::after")) return null;

    const left = Math.max(0, Number(node.bounds.x) - padding);
    const top = Math.max(0, Number(node.bounds.y) - padding);
    const right = Math.min(Number(canvas.width), Number(node.bounds.right) + padding);
    const bottom = Math.min(Number(canvas.height), Number(node.bounds.bottom) + padding);

    return {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
        right,
        bottom,
    };
}

function applyRasterCaptureBounds(node, captureBounds) {
    node.bounds = captureBounds;
    node.requiredBottom = captureBounds.bottom;
    node.renderWidth = captureBounds.width;
    node.renderHeight = captureBounds.height;
    node.layoutWidth = captureBounds.width;
    node.layoutHeight = captureBounds.height;
}

async function prepareRasterCapture(page, node) {
    await page.evaluate(
        ({ domId, captureMode }) => {
            const stateKey = "__htmlToPsRasterCaptureState";
            if (window[stateKey]) {
                throw new Error("A previous raster capture was not restored.");
            }

            const target = Array.from(document.querySelectorAll("[data-ps-node-id]")).find(
                element => element.getAttribute("data-ps-node-id") === domId,
            );
            if (!target) throw new Error(`Raster capture target ${domId} was not found.`);

            const state = {
                attributes: [],
                textNodes: [],
                style: null,
            };
            window[stateKey] = state;

            function mark(element, attribute, value = "") {
                state.attributes.push({
                    element,
                    attribute,
                    hadAttribute: element.hasAttribute(attribute),
                    value: element.getAttribute(attribute),
                });
                element.setAttribute(attribute, value);
            }

            for (const element of Array.from(document.querySelectorAll("body *"))) {
                if (element === target || element.contains(target) || target.contains(element)) continue;
                mark(element, "data-html-to-ps-capture-hidden");
            }

            let ancestor = target.parentElement;
            while (ancestor) {
                mark(ancestor, "data-html-to-ps-capture-ancestor");
                ancestor = ancestor.parentElement;
            }

            mark(target, "data-html-to-ps-capture-target", captureMode);

            if (captureMode === "backdrop") {
                for (const child of Array.from(target.childNodes)) {
                    if (child.nodeType !== Node.TEXT_NODE) continue;
                    const wrapper = document.createElement("html-to-ps-text");
                    wrapper.setAttribute("data-html-to-ps-capture-text", "");
                    child.parentNode.insertBefore(wrapper, child);
                    wrapper.appendChild(child);
                    state.textNodes.push({ node: child, wrapper });
                }
            }

            const style = document.createElement("style");
            style.setAttribute("data-html-to-ps-capture-style", "");
            style.textContent = `
                [data-html-to-ps-capture-hidden] {
                    opacity: 0 !important;
                }
                [data-html-to-ps-capture-ancestor] {
                    opacity: 1 !important;
                    background-color: transparent !important;
                    background-image: none !important;
                    border-color: transparent !important;
                    box-shadow: none !important;
                }
                [data-html-to-ps-capture-ancestor]::before,
                [data-html-to-ps-capture-ancestor]::after {
                    content: none !important;
                    display: none !important;
                }
                [data-html-to-ps-capture-target] {
                    opacity: 1 !important;
                }
                [data-html-to-ps-capture-target="backdrop"] > * {
                    opacity: 0 !important;
                }
                [data-html-to-ps-capture-text] {
                    opacity: 0 !important;
                }
            `;
            document.head.appendChild(style);
            state.style = style;
        },
        {
            domId: node.domId || node.id,
            captureMode: node.rasterCapture || "element",
        },
    );
}

async function restoreRasterCapture(page) {
    await page.evaluate(() => {
        const stateKey = "__htmlToPsRasterCaptureState";
        const state = window[stateKey];
        if (!state) return;

        try {
            for (const entry of state.textNodes || []) {
                entry.wrapper.replaceWith(entry.node);
            }
            for (let i = (state.attributes || []).length - 1; i >= 0; i -= 1) {
                const entry = state.attributes[i];
                if (entry.hadAttribute) {
                    entry.element.setAttribute(entry.attribute, entry.value);
                } else {
                    entry.element.removeAttribute(entry.attribute);
                }
            }
            state.style?.remove();
        } finally {
            delete window[stateKey];
        }
    });
}

async function annotateRenderedFonts(page, scene) {
    const textNodes = [];
    walkNodes(
        scene.sections,
        (node, section) => {
            if (node?.type === "text" && node.text) textNodes.push({ node, section });
        },
        null,
        (error, node, section) => {
            scene.warnings.push(
                `${nodeLocation(node, section)} could not enter the rendered-font inspection queue: ${errorMessage(error)}`,
            );
        },
    );

    if (!textNodes.length) return;

    let session;
    try {
        session = await page.context().newCDPSession(page);
        await session.send("DOM.enable");
        await session.send("CSS.enable");
        const { root } = await session.send("DOM.getDocument", { depth: 0 });

        for (const { node, section } of textNodes) {
            try {
                const domId = node.domId || node.id;
                const { nodeId } = await session.send("DOM.querySelector", {
                    nodeId: root.nodeId,
                    selector: `[data-ps-node-id="${domId}"]`,
                });
                if (!nodeId) {
                    throw new Error(`DOM node ${domId} was not found.`);
                }

                const response = await session.send("CSS.getPlatformFontsForNode", { nodeId });
                const renderedFonts = Array.from(response.fonts || [])
                    .filter(font => Number(font.glyphCount || 0) > 0)
                    .map(font => ({
                        familyName: String(font.familyName || ""),
                        postScriptName: String(font.postScriptName || ""),
                        isCustomFont: Boolean(font.isCustomFont),
                        glyphCount: Number(font.glyphCount || 0),
                    }))
                    .sort((a, b) => b.glyphCount - a.glyphCount);

                node.text.renderedFonts = renderedFonts;
                node.text.renderedPostScriptName = renderedFonts[0]?.postScriptName || null;

                if (!renderedFonts.length) {
                    scene.warnings.push(
                        `${nodeLocation(node, section)} has no browser-rendered font information; Photoshop will use exact-name resolution.`,
                    );
                } else if (renderedFonts.length > 1) {
                    const summary = renderedFonts
                        .map(font => `${font.postScriptName || font.familyName} (${font.glyphCount} glyphs)`)
                        .join(", ");
                    scene.warnings.push(
                        `${nodeLocation(node, section)} uses multiple browser fonts: ${summary}. ` +
                            `A single editable Photoshop text layer will use the dominant rendered font ` +
                            `"${renderedFonts[0].postScriptName || renderedFonts[0].familyName}".`,
                    );
                }
            } catch (error) {
                scene.warnings.push(`${nodeLocation(node, section)} rendered-font inspection failed: ${errorMessage(error)}`);
            }
        }
    } catch (error) {
        scene.warnings.push(`Browser rendered-font inspection is unavailable: ${errorMessage(error)}`);
    } finally {
        try {
            await session?.detach();
        } catch {}
    }
}

export async function extractScene({ input, outputDir, rootSelector = "#detail-page", headless = true }) {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(path.join(outputDir, "fallback"), { recursive: true });

    let target;
    if (/^https?:\/\//i.test(input) || /^file:/i.test(input)) {
        target = input;
    } else {
        target = pathToFileURL(path.resolve(input)).href;
    }

    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
        viewport: { width: 1800, height: 1200 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    try {
        await page.goto(target, { waitUntil: "networkidle" });

        await page.evaluate(async () => {
            if (document.fonts?.ready) {
                await document.fonts.ready;
            }
            const images = Array.from(document.images);
            await Promise.all(
                images.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(resolve => {
                        img.addEventListener("load", resolve, { once: true });
                        img.addEventListener("error", resolve, { once: true });
                    });
                }),
            );
        });

        const fontPolicy = await page.evaluate(() => {
            const violations = [];
            const unreadableSheets = [];

            function inspectRules(rules, sheetLabel) {
                for (const rule of Array.from(rules || [])) {
                    if (rule.cssRules) {
                        inspectRules(rule.cssRules, sheetLabel);
                    }
                    if (!rule.style) continue;

                    const value = rule.style.getPropertyValue("font-weight");
                    if (value) {
                        violations.push({
                            source: sheetLabel,
                            selector: rule.selectorText || rule.cssText?.slice(0, 80) || "<rule>",
                            value,
                        });
                    }
                }
            }

            for (const sheet of Array.from(document.styleSheets)) {
                try {
                    inspectRules(sheet.cssRules, sheet.href || "<inline stylesheet>");
                } catch (error) {
                    unreadableSheets.push(sheet.href || "<unknown stylesheet>");
                }
            }

            for (const element of Array.from(document.querySelectorAll("[style]"))) {
                const value = element.style.getPropertyValue("font-weight");
                if (value) {
                    violations.push({
                        source: "<inline style>",
                        selector: element.id
                            ? `#${element.id}`
                            : element.getAttribute("data-ps-name") || element.tagName.toLowerCase(),
                        value,
                    });
                }
            }

            return { violations, unreadableSheets };
        });

        if (fontPolicy.violations.length) {
            const detail = fontPolicy.violations
                .slice(0, 20)
                .map(item => `${item.source} :: ${item.selector} => font-weight: ${item.value}`)
                .join("\n");
            throw new Error(
                "html-to-ps font policy violation: CSS font-weight is prohibited.\n" +
                    "Select an explicit Bold/Heavy/Black/etc. font face through font-family.\n\n" +
                    detail,
            );
        }

        const root = page.locator(rootSelector);
        await root.waitFor({ state: "visible" });
        const rootBox = await root.boundingBox();
        if (!rootBox) throw new Error(`Unable to measure ${rootSelector}.`);

        if (Math.abs(rootBox.width - 1500) > 1) {
            throw new Error(`${rootSelector} must be 1500 px wide for handoff; measured ${rootBox.width.toFixed(2)} px.`);
        }

        const referencePath = path.resolve(outputDir, "reference.png");
        await root.screenshot({
            path: referencePath,
            animations: "disabled",
            caret: "hide",
        });

        const scene = await page.evaluate(
            ({ rootSelector }) => {
                const root = document.querySelector(rootSelector);
                if (!root) throw new Error(`Missing root: ${rootSelector}`);

                const rootRect = root.getBoundingClientRect();
                let sequence = 0;
                let uidCounter = 0;
                let nodeCounter = 0;

                function uid(el) {
                    let value = el.getAttribute("data-ps-node-id");
                    if (!value) {
                        value = `ps-${++uidCounter}`;
                        el.setAttribute("data-ps-node-id", value);
                    }
                    return value;
                }

                function num(value, fallback = 0) {
                    const parsed = Number.parseFloat(value);
                    return Number.isFinite(parsed) ? parsed : fallback;
                }

                function visible(el, style) {
                    const rect = el.getBoundingClientRect();
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        num(style.opacity, 1) > 0 &&
                        rect.width > 0 &&
                        rect.height > 0
                    );
                }

                function rgba(value) {
                    const match = String(value || "").match(
                        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i,
                    );
                    if (!match) return null;
                    return {
                        r: Math.round(num(match[1])),
                        g: Math.round(num(match[2])),
                        b: Math.round(num(match[3])),
                        a: match[4] == null ? 1 : num(match[4], 1),
                    };
                }

                function firstFontFamily(value) {
                    return String(value || "")
                        .split(",")[0]
                        .trim()
                        .replace(/^['"]|['"]$/g, "");
                }

                function transformInfo(style, el) {
                    const width = num(style.width, el.offsetWidth || 0);
                    const height = num(style.height, el.offsetHeight || 0);
                    const value = style.transform;

                    if (!value || value === "none") {
                        return {
                            rotation: 0,
                            renderWidth: width,
                            renderHeight: height,
                            layoutWidth: width,
                            layoutHeight: height,
                            scaleX: 1,
                            scaleY: 1,
                            unsupported: false,
                        };
                    }

                    const matrix = value.match(/^matrix\(([^)]+)\)$/);
                    if (!matrix) {
                        return {
                            rotation: 0,
                            renderWidth: width,
                            renderHeight: height,
                            layoutWidth: width,
                            layoutHeight: height,
                            scaleX: 1,
                            scaleY: 1,
                            unsupported: true,
                        };
                    }

                    const parts = matrix[1].split(",").map(part => num(part.trim()));
                    const [a, b, c, d] = parts;
                    const scaleX = Math.sqrt(a * a + b * b);
                    const scaleY = Math.sqrt(c * c + d * d);
                    const dot = a * c + b * d;
                    const skewed = Math.abs(dot) > 0.001 * Math.max(1, scaleX * scaleY);
                    const rotation = (Math.atan2(b, a) * 180) / Math.PI;

                    return {
                        rotation,
                        renderWidth: width * scaleX,
                        renderHeight: height * scaleY,
                        layoutWidth: width,
                        layoutHeight: height,
                        scaleX,
                        scaleY,
                        unsupported: skewed,
                    };
                }

                function bounds(el) {
                    const rect = el.getBoundingClientRect();
                    const x = rect.left - rootRect.left;
                    const y = rect.top - rootRect.top;
                    return {
                        x,
                        y,
                        width: rect.width,
                        height: rect.height,
                        right: x + rect.width,
                        bottom: y + rect.height,
                    };
                }

                function boundsFromRect(rect) {
                    const x = rect.left - rootRect.left;
                    const y = rect.top - rootRect.top;
                    return {
                        x,
                        y,
                        width: rect.width,
                        height: rect.height,
                        right: x + rect.width,
                        bottom: y + rect.height,
                    };
                }

                function nodeName(el, fallback) {
                    const explicit = el.getAttribute("data-ps-name") || el.getAttribute("data-ps-group");
                    if (explicit) return explicit.trim();

                    if (el instanceof HTMLImageElement && el.alt) return el.alt.trim();

                    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
                    if (text && text.length <= 40) return text;

                    return fallback;
                }

                function elementLocator(el) {
                    const parts = [];
                    let current = el;

                    while (current && current !== root && parts.length < 5) {
                        let part = current.tagName ? current.tagName.toLowerCase() : "element";
                        if (current.id) {
                            part += `#${current.id}`;
                        } else {
                            const psAttribute = current.hasAttribute?.("data-ps-name")
                                ? "data-ps-name"
                                : current.hasAttribute?.("data-ps-group")
                                  ? "data-ps-group"
                                  : null;
                            const psName = psAttribute && current.getAttribute(psAttribute);
                            if (psName) {
                                part += `[${psAttribute}="${String(psName).replace(/"/g, "&quot;")}"]`;
                            } else if (current.classList && current.classList.length) {
                                part += `.${Array.from(current.classList).slice(0, 2).join(".")}`;
                            }

                            let sameTagIndex = 1;
                            let sibling = current.previousElementSibling;
                            while (sibling) {
                                if (sibling.tagName === current.tagName) sameTagIndex += 1;
                                sibling = sibling.previousElementSibling;
                            }
                            part += `:nth-of-type(${sameTagIndex})`;
                        }
                        parts.unshift(part);
                        current = current.parentElement;
                    }

                    return parts.join(" > ") || "<root>";
                }

                function directMeaningfulText(el) {
                    return Array.from(el.childNodes)
                        .filter(node => node.nodeType === Node.TEXT_NODE)
                        .map(node => node.textContent || "")
                        .join("")
                        .trim();
                }

                function hasTextElementChild(el) {
                    return Array.from(el.children).some(child => {
                        if (child.tagName === "BR") return false;
                        return Boolean((child.innerText || child.textContent || "").trim());
                    });
                }

                function explicitRole(el) {
                    return (el.getAttribute("data-ps-role") || "").trim().toLowerCase();
                }

                function shouldText(el) {
                    const role = explicitRole(el);
                    if (role === "text") return true;
                    if (role && role !== "text") return false;

                    // Preserve independently styled runs instead of collapsing a
                    // composite element into one Photoshop text layer.
                    if (hasTextElementChild(el)) return false;

                    const tag = el.tagName;
                    if (/^H[1-6]$/.test(tag)) return true;
                    if (["P", "SPAN", "STRONG", "EM", "SMALL", "LABEL", "LI", "TD", "TH"].includes(tag)) {
                        return Boolean((el.innerText || el.textContent || "").trim());
                    }
                    return Boolean(directMeaningfulText(el)) && el.children.length === 0;
                }

                function hasAuthoredTextBoxSize(el) {
                    if (el.style.getPropertyValue("width") || el.style.getPropertyValue("height")) {
                        return true;
                    }

                    function changesLayoutWhenAuto(property) {
                        const beforeStyle = getComputedStyle(el);
                        const before = num(beforeStyle.getPropertyValue(property), 0);
                        const inlineValue = el.style.getPropertyValue(property);
                        const inlinePriority = el.style.getPropertyPriority(property);

                        try {
                            el.style.setProperty(property, "auto", "important");
                            const after = num(getComputedStyle(el).getPropertyValue(property), 0);
                            return Math.abs(before - after) > 0.5;
                        } finally {
                            if (inlineValue) {
                                el.style.setProperty(property, inlineValue, inlinePriority);
                            } else {
                                el.style.removeProperty(property);
                            }
                        }
                    }

                    function matchesRules(rules) {
                        for (const rule of Array.from(rules || [])) {
                            if (rule instanceof CSSMediaRule && !window.matchMedia(rule.conditionText).matches) {
                                continue;
                            }
                            if (
                                typeof CSSSupportsRule !== "undefined" &&
                                rule instanceof CSSSupportsRule &&
                                !CSS.supports(rule.conditionText)
                            ) {
                                continue;
                            }
                            if (rule.cssRules && matchesRules(rule.cssRules)) {
                                return true;
                            }
                            if (!rule.style || !rule.selectorText) continue;
                            if (!rule.style.getPropertyValue("width") && !rule.style.getPropertyValue("height")) {
                                continue;
                            }
                            try {
                                if (el.matches(rule.selectorText)) return true;
                            } catch (_) {}
                        }
                        return false;
                    }

                    for (const sheet of Array.from(document.styleSheets)) {
                        try {
                            if (matchesRules(sheet.cssRules)) return true;
                        } catch (_) {
                            // Local file and cross-origin stylesheets may apply while
                            // keeping cssRules inaccessible. Layout probing below
                            // detects their effective width/height declarations.
                        }
                    }

                    return changesLayoutWhenAuto("width") || changesLayoutWhenAuto("height");
                }

                function hasUnsupportedVisual(style) {
                    const clip = style.clipPath && style.clipPath !== "none";
                    const filter = style.filter && style.filter !== "none";
                    const backdrop = style.backdropFilter && style.backdropFilter !== "none";
                    const mask =
                        (style.maskImage && style.maskImage !== "none") ||
                        (style.webkitMaskImage && style.webkitMaskImage !== "none");
                    const mixBlend = style.mixBlendMode && style.mixBlendMode !== "normal";
                    const textShadow = style.textShadow && style.textShadow !== "none";
                    return Boolean(clip || filter || backdrop || mask || mixBlend || textShadow);
                }

                function hasVisibleBorder(style) {
                    return ["Top", "Right", "Bottom", "Left"].some(side => {
                        const width = num(style[`border${side}Width`], 0);
                        const borderStyle = style[`border${side}Style`];
                        const color = rgba(style[`border${side}Color`]);
                        return width > 0 && borderStyle !== "none" && color && color.a > 0;
                    });
                }

                function hasBorderRadius(style) {
                    return [
                        style.borderTopLeftRadius,
                        style.borderTopRightRadius,
                        style.borderBottomRightRadius,
                        style.borderBottomLeftRadius,
                    ].some(value => num(value, 0) > 0);
                }

                function pseudoHasVisual(el, pseudo) {
                    const style = getComputedStyle(el, pseudo);
                    const content = String(style.content || "").trim();
                    const hasContent = content && content !== "none" && content !== "normal";
                    const background = rgba(style.backgroundColor);
                    const hasBackgroundColor = background && background.a > 0;
                    const hasBackgroundImage = style.backgroundImage && style.backgroundImage !== "none";
                    const hasShadow = style.boxShadow && style.boxShadow !== "none";
                    return Boolean(
                        hasContent || hasBackgroundColor || hasBackgroundImage || hasShadow || hasVisibleBorder(style),
                    );
                }

                function backdropFallbackReasons(el, style) {
                    const reasons = [];
                    if (style.backgroundImage && style.backgroundImage !== "none") reasons.push("background image/gradient");
                    if (style.boxShadow && style.boxShadow !== "none") reasons.push("box shadow");
                    if (hasVisibleBorder(style)) reasons.push("border");
                    if (hasBorderRadius(style)) reasons.push("border radius");
                    if (pseudoHasVisual(el, "::before")) reasons.push("::before");
                    if (pseudoHasVisual(el, "::after")) reasons.push("::after");
                    return reasons;
                }

                function paintOrder(style) {
                    const z = style.zIndex === "auto" ? 0 : num(style.zIndex, 0);
                    return z * 1000000 + ++sequence;
                }

                function baseNodeFromBounds(el, type, name, style, box, locator = elementLocator(el)) {
                    const transform = transformInfo(style, el);
                    const domId = uid(el);
                    return {
                        id: `${domId}-node-${++nodeCounter}`,
                        domId,
                        type,
                        name,
                        locator,
                        mode: "native",
                        bounds: box,
                        requiredBottom: box.bottom,
                        opacity: num(style.opacity, 1),
                        fontFamily: firstFontFamily(style.fontFamily),
                        rotation: transform.rotation,
                        renderWidth: transform.renderWidth || box.width,
                        renderHeight: transform.renderHeight || box.height,
                        layoutWidth: transform.layoutWidth || box.width,
                        layoutHeight: transform.layoutHeight || box.height,
                        scaleX: transform.scaleX || 1,
                        scaleY: transform.scaleY || 1,
                        paintOrder: paintOrder(style),
                        children: [],
                        text: null,
                        image: null,
                        shape: null,
                        rasterPath: null,
                        fallbackReason: null,
                    };
                }

                function baseNode(el, type, name, style) {
                    return baseNodeFromBounds(el, type, name, style, bounds(el));
                }

                function makeSkipped(el, style, error, fallbackName = "Element") {
                    let node;
                    try {
                        node = baseNode(el, "raster", nodeName(el, fallbackName), style);
                    } catch (_) {
                        let domId = null;
                        let locator = "<unavailable>";
                        try {
                            domId = uid(el);
                        } catch (_) {}
                        try {
                            locator = elementLocator(el);
                        } catch (_) {}
                        node = {
                            id: `${domId || "failed"}-node-${++nodeCounter}`,
                            domId,
                            type: "raster",
                            name: fallbackName,
                            locator,
                            bounds: { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 },
                            requiredBottom: 0,
                            opacity: 1,
                            fontFamily: "",
                            rotation: 0,
                            renderWidth: 0,
                            renderHeight: 0,
                            layoutWidth: 0,
                            layoutHeight: 0,
                            scaleX: 1,
                            scaleY: 1,
                            paintOrder: ++sequence,
                            children: [],
                            text: null,
                            image: null,
                            shape: null,
                            rasterPath: null,
                            fallbackReason: null,
                        };
                    }
                    node.mode = "skipped";
                    let message;
                    try {
                        message = error && error.message ? error.message : String(error);
                    } catch (_) {
                        message = "<unknown error>";
                    }
                    node.fallbackReason = `browser extraction failed: ${message}`;
                    return node;
                }

                function makeRaster(el, name, style, reason) {
                    const node = baseNode(el, "raster", name, style);
                    node.mode = "smart";
                    node.fallbackReason = reason;
                    // The fallback screenshot already contains the final browser transform.
                    // Place it using the measured visual bounding box without applying the
                    // CSS transform a second time in Photoshop.
                    node.rotation = 0;
                    node.renderWidth = node.bounds.width;
                    node.renderHeight = node.bounds.height;
                    return node;
                }

                function makeBackdrop(el, style, name) {
                    const reasons = backdropFallbackReasons(el, style);
                    if (reasons.length) {
                        const node = makeRaster(
                            el,
                            `${name} - Backdrop`,
                            style,
                            `backdrop requires rendered fallback: ${reasons.join(", ")}`,
                        );
                        node.rasterCapture = "backdrop";
                        return node;
                    }

                    const background = rgba(style.backgroundColor);
                    if (!background || background.a <= 0) return null;

                    const node = baseNode(el, "shape", `${name} - Background`, style);
                    node.shape = {
                        fill: background,
                        borderColor: null,
                        borderWidth: 0,
                        borderRadius: 0,
                    };
                    return node;
                }

                function makeText(el, style) {
                    const explicitMode = (el.getAttribute("data-ps-text-mode") || "").trim().toLowerCase();
                    const layoutAlignedText =
                        !explicitMode &&
                        ["flex", "inline-flex", "grid", "inline-grid"].includes(style.display) &&
                        !hasTextElementChild(el);

                    // Point text has no wrapping box in the browser: its glyphs start
                    // at the content-box origin, inset from any border/padding that a
                    // separate backdrop layer captured. Measure the real text-run
                    // bounds so native Photoshop text lands where the browser painted
                    // it (e.g. centered inside a padded pill/box label by its equal
                    // padding) instead of at the outer border-box corner. Paragraph
                    // text with an authored box still keeps the element box so its
                    // flow/box size stays reproducible in Photoshop.
                    const authoredBox =
                        explicitMode === "paragraph" || (!explicitMode && !layoutAlignedText && hasAuthoredTextBoxSize(el));

                    let textBounds = null;
                    if (!authoredBox) {
                        try {
                            const range = document.createRange();
                            range.selectNodeContents(el);
                            const rect = range.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                textBounds = boundsFromRect(rect);
                            }
                        } catch (_) {
                            // Fall through to the authored element box below.
                        }
                    }

                    const node = textBounds
                        ? baseNodeFromBounds(el, "text", nodeName(el, "Text"), style, textBounds)
                        : baseNode(el, "text", nodeName(el, "Text"), style);
                    const color = rgba(style.color) || { r: 0, g: 0, b: 0, a: 1 };
                    const lineHeight = style.lineHeight === "normal" ? null : num(style.lineHeight, null);
                    const letterSpacing = style.letterSpacing === "normal" ? 0 : num(style.letterSpacing, 0);
                    const mode = explicitMode || (authoredBox ? "paragraph" : "point");

                    node.text = {
                        contents: (el.innerText || el.textContent || "").replace(/\r\n/g, "\n"),
                        mode,
                        family: firstFontFamily(style.fontFamily),
                        postScriptName: el.getAttribute("data-ps-font-postscript") || null,
                        sizePx: num(style.fontSize, 16),
                        lineHeightPx: lineHeight,
                        letterSpacingPx: letterSpacing,
                        align: style.textAlign || "left",
                        color,
                    };
                    return node;
                }

                function makeTextRun(textNode, style, textIndex) {
                    const parent = textNode.parentElement;
                    if (!parent) throw new Error("Text run has no parent element.");

                    const rawContents = textNode.textContent || "";
                    const preservesWhitespace = /^(pre|pre-wrap|break-spaces)$/.test(style.whiteSpace);
                    const contents = preservesWhitespace
                        ? rawContents.replace(/\r\n/g, "\n")
                        : rawContents.replace(/\s+/g, " ").trim();
                    if (!contents) return null;

                    const range = document.createRange();
                    range.selectNodeContents(textNode);
                    const rect = range.getBoundingClientRect();
                    if (!(rect.width > 0) || !(rect.height > 0)) return null;

                    const locator = `${elementLocator(parent)} ::text(${textIndex})`;
                    const node = baseNodeFromBounds(
                        parent,
                        "text",
                        contents.length <= 40 ? contents : "Text run",
                        style,
                        boundsFromRect(rect),
                        locator,
                    );
                    node.layoutWidth = rect.width;
                    node.layoutHeight = rect.height;
                    const color = rgba(style.color) || { r: 0, g: 0, b: 0, a: 1 };
                    const lineHeight = style.lineHeight === "normal" ? null : num(style.lineHeight, null);
                    const letterSpacing = style.letterSpacing === "normal" ? 0 : num(style.letterSpacing, 0);

                    node.text = {
                        contents,
                        mode: "point",
                        family: firstFontFamily(style.fontFamily),
                        postScriptName: parent.getAttribute("data-ps-font-postscript") || null,
                        sizePx: num(style.fontSize, 16),
                        lineHeightPx: lineHeight,
                        letterSpacingPx: letterSpacing,
                        align: style.textAlign || "left",
                        color,
                    };
                    return node;
                }

                function makeImage(el, style) {
                    const name = nodeName(el, "Image");
                    const transform = transformInfo(style, el);
                    const fallbackReasons = [];
                    const objectFit = style.objectFit || "fill";
                    const objectPosition = String(style.objectPosition || "50% 50%").trim();
                    const renderedWidth = num(style.width, el.clientWidth || el.width || 0);
                    const renderedHeight = num(style.height, el.clientHeight || el.height || 0);
                    const sourceRatio = el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : null;
                    const boxRatio = renderedWidth > 0 && renderedHeight > 0 ? renderedWidth / renderedHeight : null;

                    if (el.hasAttribute("data-ps-flatten")) fallbackReasons.push("data-ps-flatten");
                    if (hasUnsupportedVisual(style)) fallbackReasons.push("unsupported clipping/filter/mask/blend");
                    if (transform.unsupported) fallbackReasons.push("unsupported transform");
                    if (hasVisibleBorder(style)) fallbackReasons.push("border");
                    if (hasBorderRadius(style)) fallbackReasons.push("border radius");
                    if (style.boxShadow && style.boxShadow !== "none") fallbackReasons.push("box shadow");

                    if (objectFit === "none" || objectFit === "scale-down") {
                        fallbackReasons.push(`object-fit: ${objectFit}`);
                    } else if (objectFit !== "fill" && sourceRatio && boxRatio && Math.abs(sourceRatio - boxRatio) > 0.01) {
                        fallbackReasons.push(`object-fit: ${objectFit} changes visible image bounds`);
                    }

                    if (objectFit !== "fill" && objectPosition !== "50% 50%") {
                        fallbackReasons.push(`object-position: ${objectPosition}`);
                    }

                    if (fallbackReasons.length) {
                        return makeRaster(el, name, style, `image requires rendered fallback: ${fallbackReasons.join(", ")}`);
                    }

                    const node = baseNode(el, "image", name, style);
                    node.image = {
                        src: el.currentSrc || el.src,
                        assetPath: null,
                        objectFit,
                        objectPosition,
                    };
                    return node;
                }

                function makeShape(el, style) {
                    const pseudoReasons = backdropFallbackReasons(el, style).filter(
                        reason => reason === "::before" || reason === "::after",
                    );
                    if (
                        el.hasAttribute("data-ps-flatten") ||
                        hasUnsupportedVisual(style) ||
                        transformInfo(style, el).unsupported ||
                        pseudoReasons.length
                    ) {
                        const reason = pseudoReasons.length
                            ? `shape requires rendered fallback: ${pseudoReasons.join(", ")}`
                            : "shape requires rendered fallback";
                        return makeRaster(el, nodeName(el, "Shape"), style, reason);
                    }

                    const node = baseNode(el, "shape", nodeName(el, "Shape"), style);
                    node.shape = {
                        fill: rgba(style.backgroundColor),
                        borderColor: rgba(style.borderTopColor),
                        borderWidth: num(style.borderTopWidth, 0),
                        borderRadius: num(style.borderTopLeftRadius, 0),
                    };
                    return node;
                }

                function flattenChildren(el, result, parentOpacityApplied = false) {
                    let textIndex = 0;
                    for (const child of Array.from(el.childNodes)) {
                        let style;
                        try {
                            if (child.nodeType === Node.TEXT_NODE) {
                                const textNode = makeTextRun(child, getComputedStyle(el), ++textIndex);
                                if (textNode) {
                                    if (parentOpacityApplied) textNode.opacity = 1;
                                    result.push(textNode);
                                }
                                continue;
                            }

                            if (child.nodeType !== Node.ELEMENT_NODE) continue;
                            if (child.hasAttribute("data-ps-ignore")) continue;
                            style = getComputedStyle(child);
                            if (!visible(child, style)) continue;

                            const role = explicitRole(child);

                            if (child.hasAttribute("data-ps-flatten")) {
                                result.push(makeRaster(child, nodeName(child, "Flattened visual"), style, "data-ps-flatten"));
                                continue;
                            }

                            if (child.hasAttribute("data-ps-group")) {
                                result.push(makeGroup(child, style));
                                continue;
                            }

                            const transform = transformInfo(style, child);
                            const transformedContainer =
                                style.transform && style.transform !== "none" && child.children.length > 0;
                            if (hasUnsupportedVisual(style) || transform.unsupported || transformedContainer) {
                                result.push(
                                    makeRaster(
                                        child,
                                        nodeName(child, "Rendered visual"),
                                        style,
                                        transform.unsupported || transformedContainer
                                            ? "element container transform requires rendered fallback"
                                            : "element uses unsupported clipping/filter/mask/blend/text-shadow",
                                    ),
                                );
                                continue;
                            }

                            if (role === "image" || child instanceof HTMLImageElement) {
                                result.push(makeImage(child, style));
                                continue;
                            }

                            if (role === "shape") {
                                result.push(makeShape(child, style));
                                continue;
                            }

                            if (role === "text" || shouldText(child)) {
                                const backdrop = makeBackdrop(child, style, nodeName(child, "Text"));
                                if (backdrop) result.push(backdrop);
                                result.push(makeText(child, style));
                                continue;
                            }

                            if (num(style.opacity, 1) < 0.999 && child.children.length > 0) {
                                result.push(makeGroup(child, style));
                                continue;
                            }

                            const backdrop = makeBackdrop(child, style, nodeName(child, "Element"));
                            if (backdrop) result.push(backdrop);
                            flattenChildren(child, result);
                        } catch (error) {
                            result.push(makeSkipped(child, style, error));
                        }
                    }
                }

                function makeGroup(el, style = getComputedStyle(el)) {
                    if (el.hasAttribute("data-ps-flatten")) {
                        return makeRaster(el, nodeName(el, "Flattened group"), style, "data-ps-flatten");
                    }

                    const transform = transformInfo(style, el);
                    const transformedContainer = style.transform && style.transform !== "none" && el.children.length > 0;
                    if (hasUnsupportedVisual(style) || transform.unsupported || transformedContainer) {
                        return makeRaster(
                            el,
                            nodeName(el, "Group"),
                            style,
                            transform.unsupported || transformedContainer
                                ? "group container transform requires rendered fallback"
                                : "group uses unsupported clipping/filter/mask/blend/text-shadow",
                        );
                    }

                    const node = baseNode(el, "group", nodeName(el, "Section"), style);
                    const backdrop = makeBackdrop(el, style, node.name);
                    if (backdrop) {
                        backdrop.paintOrder = -1000000000 + node.paintOrder;
                        backdrop.opacity = 1;
                        node.children.push(backdrop);
                    }

                    flattenChildren(el, node.children, true);

                    let maxBottom = node.bounds.bottom;
                    for (const child of node.children) {
                        maxBottom = Math.max(
                            maxBottom,
                            num(child?.requiredBottom, num(child?.bounds?.bottom, node.bounds.bottom)),
                        );
                    }
                    node.requiredBottom = maxBottom;
                    return node;
                }

                const sections = [];
                const topChildren = [];
                for (const child of Array.from(root.children)) {
                    let style;
                    try {
                        if (child.hasAttribute("data-ps-ignore")) continue;
                        style = getComputedStyle(child);
                        if (visible(child, style)) topChildren.push(child);
                    } catch (error) {
                        sections.push(makeSkipped(child, style, error, "Section"));
                    }
                }

                if (!topChildren.length && !sections.length) {
                    try {
                        sections.push(makeGroup(root, getComputedStyle(root)));
                    } catch (error) {
                        sections.push(makeSkipped(root, undefined, error, "Design root"));
                    }
                } else {
                    for (const child of topChildren) {
                        let style;
                        try {
                            style = getComputedStyle(child);
                            // Every top-level design block becomes a Photoshop group, even when
                            // the HTML author did not explicitly use <section>.
                            sections.push(makeGroup(child, style));
                        } catch (error) {
                            sections.push(makeSkipped(child, style, error, "Section"));
                        }
                    }
                }

                return {
                    version: "0.0.1",
                    canvas: {
                        width: rootRect.width,
                        height: rootRect.height,
                        resolution: 72,
                    },
                    rootSelector,
                    sections,
                    warnings: [],
                };
            },
            { rootSelector },
        );

        if (fontPolicy.unreadableSheets.length) {
            scene.warnings.push(
                `Could not inspect font-weight declarations in ${fontPolicy.unreadableSheets.length} cross-origin stylesheet(s).`,
            );
        }

        walkNodes(
            scene.sections,
            (node, section) => {
                if (node?.mode === "skipped") {
                    scene.warnings.push(
                        `${nodeLocation(node, section)} was skipped during browser extraction: ${node.fallbackReason || "unknown reason"}`,
                    );
                }
            },
            null,
            (error, node, section) => {
                scene.warnings.push(
                    `${nodeLocation(node, section)} could not be inspected after extraction: ${errorMessage(error)}`,
                );
            },
        );

        await annotateRenderedFonts(page, scene);

        // Local fallback screenshots.
        const rasterNodes = [];
        walkNodes(
            scene.sections,
            (node, section) => {
                if (node.type === "raster") rasterNodes.push({ node, section });
            },
            null,
            (error, node, section) => {
                scene.warnings.push(
                    `${nodeLocation(node, section)} could not enter the raster fallback queue: ${errorMessage(error)}`,
                );
            },
        );

        for (const { node, section } of rasterNodes) {
            if (node.mode === "skipped") continue;
            const targetLocator = page.locator(`[data-ps-node-id="${node.domId || node.id}"]`);
            const fallbackPath = path.resolve(outputDir, "fallback", `${safeName(node.name)}-${node.id}.png`);
            const expandedBounds = pseudoCaptureBounds(node, scene.canvas);

            try {
                await prepareRasterCapture(page, node);
                if (expandedBounds) {
                    await page.screenshot({
                        path: fallbackPath,
                        animations: "disabled",
                        caret: "hide",
                        fullPage: true,
                        omitBackground: true,
                        clip: {
                            x: rootBox.x + expandedBounds.x,
                            y: rootBox.y + expandedBounds.y,
                            width: expandedBounds.width,
                            height: expandedBounds.height,
                        },
                    });
                    applyRasterCaptureBounds(node, expandedBounds);
                } else {
                    await targetLocator.screenshot({
                        path: fallbackPath,
                        animations: "disabled",
                        caret: "hide",
                        omitBackground: true,
                    });
                }
                node.rasterPath = fallbackPath;
            } catch (error) {
                node.mode = "skipped";
                node.fallbackReason = `${node.fallbackReason || "fallback"}; screenshot failed: ${errorMessage(error)}`;
                scene.warnings.push(`${nodeLocation(node, section)} fallback screenshot failed: ${errorMessage(error)}`);
            } finally {
                try {
                    await restoreRasterCapture(page);
                } catch (restoreError) {
                    scene.warnings.push(
                        `${nodeLocation(node, section)} raster capture cleanup failed: ${errorMessage(restoreError)}`,
                    );
                }
            }
        }

        // Materialize image assets so the one-time JSX is self-contained.
        const imageNodes = [];
        walkNodes(
            scene.sections,
            (node, section) => {
                if (node.type === "image") imageNodes.push({ node, section });
            },
            null,
            (error, node, section) => {
                scene.warnings.push(
                    `${nodeLocation(node, section)} could not enter the image materialization queue: ${errorMessage(error)}`,
                );
            },
        );

        for (const { node, section } of imageNodes) {
            try {
                node.image.assetPath = await materializeImage(node.image.src, outputDir, node.name);
            } catch (error) {
                // A source that cannot be materialized degrades to the rendered element.
                const fallbackPath = path.resolve(outputDir, "fallback", `${safeName(node.name)}-${node.id}-image.png`);
                try {
                    try {
                        await prepareRasterCapture(page, node);
                        await page.locator(`[data-ps-node-id="${node.domId || node.id}"]`).screenshot({
                            path: fallbackPath,
                            animations: "disabled",
                            caret: "hide",
                            omitBackground: true,
                        });
                    } finally {
                        await restoreRasterCapture(page);
                    }
                    node.type = "raster";
                    node.mode = "smart";
                    node.rasterPath = fallbackPath;
                    node.fallbackReason = `image asset materialization failed: ${errorMessage(error)}`;
                    node.image = null;
                    scene.warnings.push(
                        `${nodeLocation(node, section)} was converted through local raster fallback because its source asset could not be materialized: ${errorMessage(error)}`,
                    );
                } catch (fallbackError) {
                    node.mode = "skipped";
                    node.fallbackReason = `image materialization failed: ${errorMessage(error)}; fallback screenshot failed: ${errorMessage(fallbackError)}`;
                    scene.warnings.push(`${nodeLocation(node, section)} image conversion failed: ${node.fallbackReason}`);
                }
            }
        }

        scene.referenceImage = referencePath;
        return scene;
    } finally {
        await browser.close();
    }
}
