export const SPECIALIZED_PROTOCOL_VERSION = "0.1";

export const SUPPORTED_CAPABILITIES = new Set([
    "shape-fill",
    "shape-ellipse",
    "source-trace-report",
    "specialized-fallback-boundary",
]);

const VALID_ROLES = new Set(["text", "image", "shape", "raster"]);
const VALID_SHAPE_KINDS = new Set(["rectangle", "ellipse"]);

function formatList(values) {
    return values.map(value => `- ${value}`).join("\n");
}

export async function validateSpecializedPage(page, { rootSelector = "#detail-page" } = {}) {
    const result = await page.evaluate(
        ({ rootSelector, protocolVersion, supportedCapabilities, validRoles, validShapeKinds }) => {
            const errors = [];
            const roots = Array.from(document.querySelectorAll(rootSelector));
            if (roots.length !== 1) {
                return {
                    errors: [`Expected exactly one ${rootSelector}; found ${roots.length}.`],
                    protocolVersion: null,
                    requiredCapabilities: [],
                    source: null,
                };
            }

            const root = roots[0];
            const declaredVersion = root.getAttribute("data-ps-specialized-version");
            if (!declaredVersion) {
                errors.push(`${rootSelector} must declare data-ps-specialized-version.`);
            } else if (declaredVersion !== protocolVersion) {
                errors.push(
                    `Unsupported specialized protocol version ${JSON.stringify(declaredVersion)}; supported version is ${protocolVersion}.`,
                );
            }

            const source = root.getAttribute("data-ps-source");
            if (!source) {
                errors.push(`${rootSelector} must declare non-empty data-ps-source trace metadata.`);
            }

            const requiredCapabilities = (root.getAttribute("data-ps-required-capabilities") || "")
                .split(/\s+/)
                .filter(Boolean);
            for (const capability of requiredCapabilities) {
                if (!supportedCapabilities.includes(capability)) {
                    errors.push(`Unsupported required capability: ${capability}.`);
                }
            }

            const rootRect = root.getBoundingClientRect();
            if (Math.abs(rootRect.width - 1500) > 1) {
                errors.push(`${rootSelector} must be 1500 px wide; measured ${rootRect.width.toFixed(2)} px.`);
            }

            for (const section of Array.from(root.children)) {
                if (section.tagName.toLowerCase() === "section" && !section.hasAttribute("data-ps-group")) {
                    errors.push("Every top-level section must declare data-ps-group.");
                }
            }

            for (const group of Array.from(root.querySelectorAll("[data-ps-group]"))) {
                const name = group.getAttribute("data-ps-group") || group.id || group.tagName.toLowerCase();
                if (!group.getAttribute("data-ps-source-id")) {
                    errors.push(`${name}: group must declare data-ps-source-id.`);
                }
            }

            for (const element of Array.from(root.querySelectorAll("[data-ps-role]"))) {
                const role = (element.getAttribute("data-ps-role") || "").trim().toLowerCase();
                const name = element.getAttribute("data-ps-name") || element.id || element.tagName.toLowerCase();
                if (!validRoles.includes(role)) {
                    errors.push(`${name}: invalid data-ps-role ${JSON.stringify(role)}.`);
                    continue;
                }
                if (!element.getAttribute("data-ps-source-id")) {
                    errors.push(`${name}: visible primitive must declare data-ps-source-id.`);
                }

                if (role === "shape") {
                    const kind = (element.getAttribute("data-ps-shape-kind") || "").trim().toLowerCase();
                    if (!validShapeKinds.includes(kind)) {
                        errors.push(`${name}: invalid or missing data-ps-shape-kind ${JSON.stringify(kind)}.`);
                    }
                }
                const style = getComputedStyle(element);
                if (role === "text") {
                    const hasBackground = style.backgroundImage !== "none" || style.backgroundColor !== "rgba(0, 0, 0, 0)";
                    const hasBorder = [
                        style.borderTopWidth,
                        style.borderRightWidth,
                        style.borderBottomWidth,
                        style.borderLeftWidth,
                    ].some(value => Number.parseFloat(value || "0") > 0);
                    if (hasBackground || hasBorder || style.boxShadow !== "none" || style.textShadow !== "none") {
                        errors.push(`${name}: text primitive must not carry background, border, or shadow visuals.`);
                    }
                    for (const property of ["fontFamily", "fontSize", "lineHeight"]) {
                        if (!style[property] || style[property] === "normal") {
                            errors.push(`${name}: text primitive must explicitly resolve ${property}.`);
                        }
                    }
                    if (!style.letterSpacing) {
                        errors.push(`${name}: text primitive must resolve letterSpacing.`);
                    }
                }
                if (role === "shape") {
                    const kind = (element.getAttribute("data-ps-shape-kind") || "").trim().toLowerCase();
                    const hasBorder = [
                        style.borderTopWidth,
                        style.borderRightWidth,
                        style.borderBottomWidth,
                        style.borderLeftWidth,
                    ].some(value => Number.parseFloat(value || "0") > 0);
                    const hasRadius = [
                        style.borderTopLeftRadius,
                        style.borderTopRightRadius,
                        style.borderBottomRightRadius,
                        style.borderBottomLeftRadius,
                    ].some(value => Number.parseFloat(value || "0") > 0);
                    if (
                        hasBorder ||
                        (kind !== "ellipse" && hasRadius) ||
                        style.backgroundImage !== "none" ||
                        style.boxShadow !== "none"
                    ) {
                        errors.push(
                            `${name}: protocol 0.1 shape must be a solid rectangle/ellipse fill without stroke, radius, image, or shadow.`,
                        );
                    }
                }
                if (role === "image" && element.tagName.toLowerCase() !== "img") {
                    errors.push(`${name}: image primitives must use an img element.`);
                }
                if (role === "raster" && !element.hasAttribute("data-ps-flatten")) {
                    errors.push(`${name}: raster primitives must declare data-ps-flatten.`);
                }
            }

            for (const element of Array.from(root.querySelectorAll("*"))) {
                if (element.hasAttribute("data-ps-role") || element.hasAttribute("data-ps-group")) continue;
                if (element.closest("[data-ps-flatten]")) continue;
                if (element.children.length > 0) continue;
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                const visible =
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    Number.parseFloat(style.opacity || "1") > 0 &&
                    rect.width > 0 &&
                    rect.height > 0;
                if (!visible) continue;

                const hasText = Boolean((element.innerText || element.textContent || "").trim());
                const hasVisual =
                    element.tagName.toLowerCase() === "img" ||
                    hasText ||
                    style.backgroundImage !== "none" ||
                    style.backgroundColor !== "rgba(0, 0, 0, 0)";
                if (hasVisual) {
                    const name = element.getAttribute("data-ps-name") || element.id || element.tagName.toLowerCase();
                    errors.push(`${name}: visible leaf primitive must declare data-ps-role.`);
                }
            }

            for (const element of Array.from(root.querySelectorAll('[data-ps-generated="true"]'))) {
                const name = element.getAttribute("data-ps-name") || element.id || element.tagName.toLowerCase();
                for (const attribute of ["data-ps-source-id", "data-ps-origin-part", "data-ps-rewrite"]) {
                    if (!element.getAttribute(attribute)) {
                        errors.push(`${name}: generated primitive must declare ${attribute}.`);
                    }
                }
            }

            const unreadableSheets = [];
            function inspectRules(rules, sheetLabel) {
                for (const rule of Array.from(rules || [])) {
                    if (rule.cssRules) inspectRules(rule.cssRules, sheetLabel);
                    if (!rule.style) continue;
                    const value = rule.style.getPropertyValue("font-weight");
                    if (value) {
                        errors.push(
                            `${sheetLabel} :: ${rule.selectorText || rule.cssText?.slice(0, 80) || "<rule>"} uses prohibited font-weight: ${value}.`,
                        );
                    }
                }
            }

            for (const sheet of Array.from(document.styleSheets)) {
                try {
                    inspectRules(sheet.cssRules, sheet.href || "<inline stylesheet>");
                } catch {
                    unreadableSheets.push(sheet.href || "<unknown stylesheet>");
                }
            }
            for (const element of Array.from(root.querySelectorAll("[style]"))) {
                const value = element.style.getPropertyValue("font-weight");
                if (value) {
                    errors.push(
                        `${element.getAttribute("data-ps-name") || element.id || element.tagName.toLowerCase()} uses prohibited inline font-weight: ${value}.`,
                    );
                }
            }

            return {
                errors,
                protocolVersion: declaredVersion,
                requiredCapabilities,
                source,
                unreadableSheets,
            };
        },
        {
            rootSelector,
            protocolVersion: SPECIALIZED_PROTOCOL_VERSION,
            supportedCapabilities: Array.from(SUPPORTED_CAPABILITIES),
            validRoles: Array.from(VALID_ROLES),
            validShapeKinds: Array.from(VALID_SHAPE_KINDS),
        },
    );

    if (result.errors.length) {
        throw new Error(`Specialized HTML preflight failed:\n${formatList(result.errors)}`);
    }

    return result;
}
