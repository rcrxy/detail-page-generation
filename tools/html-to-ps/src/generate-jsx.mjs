import fs from "node:fs/promises";
import path from "node:path";

function jsLiteral(value) {
    return JSON.stringify(value)
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function packagePath(value, packageDir) {
    if (!value) return value;
    const absolutePath = path.isAbsolute(value) ? value : path.resolve(packageDir, value);
    return path.relative(packageDir, absolutePath).split(path.sep).join("/") || ".";
}

export function makeScenePortable(scene, packageDir) {
    const portableScene = structuredClone(scene);
    portableScene.referenceImage = packagePath(portableScene.referenceImage, packageDir);

    function normalizeNodes(nodes) {
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (node?.image?.assetPath) {
                node.image.assetPath = packagePath(node.image.assetPath, packageDir);
                node.image.src = node.image.assetPath;
            }
            if (node?.rasterPath) {
                node.rasterPath = packagePath(node.rasterPath, packageDir);
            }
            normalizeNodes(node?.children);
        }
    }

    normalizeNodes(portableScene.sections);
    return portableScene;
}

function sceneForPhotoshop(scene) {
    const normalizedScene = structuredClone(scene);

    function normalizeNodes(nodes) {
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (node?.text && typeof node.text.contents === "string") {
                node.text.contents = node.text.contents.replace(/\r\n|\r|\n/g, "\r");
            }
            normalizeNodes(node?.children);
        }
    }

    normalizeNodes(normalizedScene.sections);
    return normalizedScene;
}

export async function generateJsx({ scene, jsxPath, reportPath, documentName, initialHeight }) {
    const packageDir = path.dirname(path.resolve(jsxPath));
    const sceneLiteral = jsLiteral(sceneForPhotoshop(makeScenePortable(scene, packageDir)));
    const reportLiteral = jsLiteral(packagePath(reportPath, packageDir));
    const documentNameLiteral = jsLiteral(documentName);

    const jsx = `
#target photoshop

(function () {
    var SCENE = ${sceneLiteral};
    var REPORT_PATH = ${reportLiteral};
    var DOCUMENT_NAME = ${documentNameLiteral};
    var INITIAL_HEIGHT = ${Math.max(1, Math.round(initialHeight))};
    var PACKAGE_DIR = new File($.fileName).parent;

    var DOC = null;
    var WARNINGS = [];
    var ERRORS = [];
    var FONT_RESOLUTION_CACHE = {};

    function px(value) {
        return UnitValue(Number(value || 0), "px");
    }

    function pt(value) {
        return UnitValue(Number(value || 0), "pt");
    }

    function round(value) {
        return Math.round(Number(value || 0) * 1000) / 1000;
    }

    function safeMessage(error) {
        try {
            return error && error.message ? error.message : String(error);
        } catch (_) {
            return "<unknown error>";
        }
    }

    function warn(message) {
        WARNINGS.push(String(message));
    }

    function fail(message) {
        ERRORS.push(String(message));
    }

    function nodeContext(node, sectionName) {
        var section = String(sectionName || "<unknown section>");
        var element = String(node && (node.locator || node.name || node.id) || "<unknown element>");
        var id = String(node && node.id || "<no id>");
        var type = String(node && node.type || "<unknown type>");
        return "[section: " + section + "] [element: " + element + "] [id: " + id + "] [type: " + type + "]";
    }

    function isAbsolutePackagePath(value) {
        var text = String(value || "");
        if (text.length === 0) return false;
        var first = text.charCodeAt(0);
        if (first === 47 || first === 92) return true;
        if (text.length >= 3 && text.charCodeAt(1) === 58 && (text.charCodeAt(2) === 47 || text.charCodeAt(2) === 92)) {
            return true;
        }
        return false;
    }

    function resolvePackagePath(filePath) {
        var value = String(filePath || "");
        if (isAbsolutePackagePath(value)) {
            return value;
        }
        return PACKAGE_DIR.fsName + "/" + value;
    }

    function normalizeFontName(value) {
        var source = String(value || "").toLowerCase();
        var result = "";
        for (var i = 0; i < source.length; i++) {
            var character = source.charAt(i);
            var code = source.charCodeAt(i);
            if (code <= 32 || character === "-" || character === "_") continue;
            result += character;
        }
        return result;
    }

    function fontProperty(font, property) {
        try {
            return String(font && font[property] || "");
        } catch (_) {
            return "";
        }
    }

    function fontResult(font, matchedBy) {
        var postScriptName = fontProperty(font, "postScriptName");
        if (!postScriptName) return null;
        return {
            postScriptName: postScriptName,
            matchedBy: matchedBy,
            style: fontProperty(font, "style"),
            reason: null
        };
    }

    function resolveInstalledFont(requestedName) {
        var requested = String(requestedName || "");
        var normalized = normalizeFontName(requested);
        var cacheKey = "$" + normalized;
        if (FONT_RESOLUTION_CACHE[cacheKey] !== undefined) {
            return FONT_RESOLUTION_CACHE[cacheKey];
        }

        var exactPostScript = null;
        var exactName = null;
        var exactFamilyStyle = null;
        var familyMatches = [];

        try {
            for (var i = 0; i < app.fonts.length; i++) {
                var font = app.fonts[i];
                var postScriptName = fontProperty(font, "postScriptName");
                var name = fontProperty(font, "name");
                var family = fontProperty(font, "family");
                var style = fontProperty(font, "style");

                if (!exactPostScript && normalizeFontName(postScriptName) === normalized) {
                    exactPostScript = fontResult(font, "PostScript name");
                }
                if (!exactName && normalizeFontName(name) === normalized) {
                    exactName = fontResult(font, "font name");
                }
                if (!exactFamilyStyle && normalizeFontName(family + " " + style) === normalized) {
                    exactFamilyStyle = fontResult(font, "family + style");
                }
                if (normalizeFontName(family) === normalized) {
                    var familyResult = fontResult(font, "unique family");
                    if (familyResult) familyMatches.push(familyResult);
                }
            }
        } catch (fontListError) {
            var listFailure = {
                postScriptName: null,
                matchedBy: null,
                reason: "Photoshop font list could not be inspected: " + safeMessage(fontListError)
            };
            FONT_RESOLUTION_CACHE[cacheKey] = listFailure;
            return listFailure;
        }

        var resolved = exactPostScript || exactName || exactFamilyStyle;
        if (!resolved && familyMatches.length === 1) {
            resolved = familyMatches[0];
        }
        if (!resolved && familyMatches.length > 1) {
            var regularMatches = [];
            for (var j = 0; j < familyMatches.length; j++) {
                var normalizedStyle = normalizeFontName(familyMatches[j].style);
                if (
                    normalizedStyle === "regular" ||
                    normalizedStyle === "normal" ||
                    normalizedStyle === "roman"
                ) {
                    regularMatches.push(familyMatches[j]);
                }
            }
            if (regularMatches.length === 1) {
                resolved = regularMatches[0];
                resolved.matchedBy = "family regular style";
            }
        }
        if (!resolved) {
            resolved = {
                postScriptName: null,
                matchedBy: null,
                reason: familyMatches.length > 1
                    ? "the family name matches multiple installed styles"
                    : "no exact installed font face matched"
            };
        }

        FONT_RESOLUTION_CACHE[cacheKey] = resolved;
        return resolved;
    }

    function solidColor(rgb) {
        var color = new SolidColor();
        color.rgb.red = Math.max(0, Math.min(255, Number(rgb && rgb.r || 0)));
        color.rgb.green = Math.max(0, Math.min(255, Number(rgb && rgb.g || 0)));
        color.rgb.blue = Math.max(0, Math.min(255, Number(rgb && rgb.b || 0)));
        return color;
    }

    function boundsPx(layer) {
        var b = layer.bounds;
        return {
            left: b[0].as("px"),
            top: b[1].as("px"),
            right: b[2].as("px"),
            bottom: b[3].as("px"),
            width: b[2].as("px") - b[0].as("px"),
            height: b[3].as("px") - b[1].as("px")
        };
    }

    function centerOfBounds(layer) {
        var b = boundsPx(layer);
        return {
            x: (b.left + b.right) / 2,
            y: (b.top + b.bottom) / 2
        };
    }

    function actionListNumber(list, index) {
        try {
            return Number(list.getDouble(index));
        } catch (_) {
            return Number(list.getUnitDoubleValue(index));
        }
    }

    function smartObjectGeometry(layer) {
        DOC.activeLayer = layer;

        var smartObjectMoreId = stringIDToTypeID("smartObjectMore");
        var transformId = stringIDToTypeID("transform");
        var reference = new ActionReference();
        reference.putProperty(
            stringIDToTypeID("property"),
            smartObjectMoreId
        );
        reference.putEnumerated(
            stringIDToTypeID("layer"),
            stringIDToTypeID("ordinal"),
            stringIDToTypeID("targetEnum")
        );

        var descriptor = executeActionGet(reference);
        if (!descriptor.hasKey(smartObjectMoreId)) {
            throw new Error("smartObjectMore is unavailable.");
        }

        var smartObjectMore = descriptor.getObjectValue(smartObjectMoreId);
        if (!smartObjectMore.hasKey(transformId)) {
            throw new Error("Smart Object transform is unavailable.");
        }

        var transform = smartObjectMore.getList(transformId);
        if (transform.count < 8) {
            throw new Error("Smart Object transform has fewer than four corners.");
        }

        var points = [];
        for (var i = 0; i < 8; i += 2) {
            points.push({
                x: actionListNumber(transform, i),
                y: actionListNumber(transform, i + 1)
            });
        }

        var width = Math.sqrt(
            Math.pow(points[1].x - points[0].x, 2) +
            Math.pow(points[1].y - points[0].y, 2)
        );
        var height = Math.sqrt(
            Math.pow(points[2].x - points[1].x, 2) +
            Math.pow(points[2].y - points[1].y, 2)
        );

        if (!(width > 0) || !(height > 0)) {
            throw new Error("Smart Object canvas geometry has zero size.");
        }

        return {
            width: width,
            height: height,
            center: {
                x: (points[0].x + points[1].x + points[2].x + points[3].x) / 4,
                y: (points[0].y + points[1].y + points[2].y + points[3].y) / 4
            }
        };
    }

    function ensureCanvasHeight(requiredBottom) {
        var target = Math.ceil(Number(requiredBottom || 0));
        var current = DOC.height.as("px");
        if (target <= current) return;

        DOC.resizeCanvas(
            px(SCENE.canvas.width),
            px(target),
            AnchorPosition.TOPCENTER
        );
    }

    function addGroup(name, parentGroup) {
        var group;
        if (parentGroup) {
            group = parentGroup.layerSets.add();
        } else {
            group = DOC.layerSets.add();
        }
        group.name = name || "Group";
        return group;
    }

    function moveInto(layer, parentGroup, node, sectionName) {
        if (!parentGroup) return;
        try {
            layer.move(parentGroup, ElementPlacement.INSIDE);
        } catch (error) {
            warn(
                nodeContext(node, sectionName) +
                " Could not move layer '" + layer.name + "' into group '" +
                parentGroup.name + "': " + safeMessage(error)
            );
        }
    }

    function placeEmbedded(filePath) {
        var file = new File(resolvePackagePath(filePath));
        if (!file.exists) {
            throw new Error("Missing file: " + file.fsName);
        }

        var idPlace = charIDToTypeID("Plc ");
        var desc = new ActionDescriptor();
        desc.putPath(charIDToTypeID("null"), file);
        desc.putEnumerated(
            charIDToTypeID("FTcs"),
            charIDToTypeID("QCSt"),
            charIDToTypeID("Qcsa")
        );

        var offset = new ActionDescriptor();
        offset.putUnitDouble(
            charIDToTypeID("Hrzn"),
            charIDToTypeID("#Pxl"),
            0
        );
        offset.putUnitDouble(
            charIDToTypeID("Vrtc"),
            charIDToTypeID("#Pxl"),
            0
        );
        desc.putObject(
            charIDToTypeID("Ofst"),
            charIDToTypeID("Ofst"),
            offset
        );

        executeAction(idPlace, desc, DialogModes.NO);
        return DOC.activeLayer;
    }

    function resizeAndPositionLayer(layer, node, width, height, rotation, sectionName) {
        var before;
        var usesSmartObjectCanvas = true;

        try {
            before = smartObjectGeometry(layer);
        } catch (geometryError) {
            usesSmartObjectCanvas = false;
            before = boundsPx(layer);
            warn(
                nodeContext(node, sectionName) +
                " Could not read the full Smart Object canvas; visible-pixel bounds will be used. " +
                "Transparent padding may affect scaling. " + safeMessage(geometryError)
            );
        }

        if (before.width <= 0 || before.height <= 0) {
            throw new Error("Placed layer has zero bounds.");
        }

        var targetW = Math.max(0.01, Number(width));
        var targetH = Math.max(0.01, Number(height));

        layer.resize(
            targetW / before.width * 100,
            targetH / before.height * 100,
            AnchorPosition.MIDDLECENTER
        );

        if (rotation && Math.abs(rotation) > 0.001) {
            layer.rotate(Number(rotation), AnchorPosition.MIDDLECENTER);
        }

        var currentCenter;
        if (usesSmartObjectCanvas) {
            try {
                currentCenter = smartObjectGeometry(layer).center;
            } catch (centerError) {
                currentCenter = centerOfBounds(layer);
                warn(
                    nodeContext(node, sectionName) +
                    " Could not read the transformed Smart Object canvas center; " +
                    "visible-pixel bounds will be used for positioning. " + safeMessage(centerError)
                );
            }
        } else {
            currentCenter = centerOfBounds(layer);
        }
        var targetCenter = {
            x: Number(node.bounds.x) + Number(node.bounds.width) / 2,
            y: Number(node.bounds.y) + Number(node.bounds.height) / 2
        };

        layer.translate(
            px(targetCenter.x - currentCenter.x),
            px(targetCenter.y - currentCenter.y)
        );
    }

    function createSmart(node, parentGroup, sourcePath, width, height, rotation, sectionName) {
        var layer = placeEmbedded(sourcePath);
        layer.name = node.name || "Smart Object";
        moveInto(layer, parentGroup, node, sectionName);

        resizeAndPositionLayer(
            layer,
            node,
            width,
            height,
            rotation,
            sectionName
        );

        try {
            layer.opacity = Math.max(0, Math.min(100, Number(node.opacity == null ? 1 : node.opacity) * 100));
        } catch (opacityError) {
            warn(
                nodeContext(node, sectionName) +
                " Could not apply layer opacity: " + safeMessage(opacityError)
            );
        }

        return layer;
    }

    function createRasterShape(node, parentGroup, sectionName) {
        var fill = node.shape && node.shape.fill;
        if (!fill || Number(fill.a || 0) <= 0) {
            return null;
        }

        var layer = parentGroup
            ? parentGroup.artLayers.add()
            : DOC.artLayers.add();

        layer.name = node.name || "Color Block";

        var centerX = Number(node.bounds.x) + Number(node.bounds.width) / 2;
        var centerY = Number(node.bounds.y) + Number(node.bounds.height) / 2;
        var width = Number(node.renderWidth || node.bounds.width);
        var height = Number(node.renderHeight || node.bounds.height);

        var x1 = centerX - width / 2;
        var y1 = centerY - height / 2;
        var x2 = centerX + width / 2;
        var y2 = centerY + height / 2;

        DOC.activeLayer = layer;
        DOC.selection.select([
            [px(x1), px(y1)],
            [px(x2), px(y1)],
            [px(x2), px(y2)],
            [px(x1), px(y2)]
        ]);

        DOC.selection.fill(solidColor(fill));
        DOC.selection.deselect();

        var combinedOpacity =
            Number(node.opacity == null ? 1 : node.opacity) *
            Number(fill.a == null ? 1 : fill.a);

        layer.opacity = Math.max(0, Math.min(100, combinedOpacity * 100));

        if (node.rotation && Math.abs(node.rotation) > 0.001) {
            layer.rotate(Number(node.rotation), AnchorPosition.MIDDLECENTER);
        }

        if (node.shape && Number(node.shape.borderWidth || 0) > 0) {
            warn(
                nodeContext(node, sectionName) + " Border on '" + node.name +
                "' is not reconstructed natively in html-to-ps 0.0.1."
            );
        }

        if (node.shape && Number(node.shape.borderRadius || 0) > 0) {
            warn(
                nodeContext(node, sectionName) + " Border radius on '" + node.name +
                "' is not reconstructed natively in html-to-ps 0.0.1."
            );
        }

        return layer;
    }

    function mapJustification(value) {
        value = String(value || "left").toLowerCase();
        if (value === "center") return Justification.CENTER;
        if (value === "right" || value === "end") return Justification.RIGHT;
        if (value === "justify") return Justification.FULLYJUSTIFIED;
        return Justification.LEFT;
    }

    function createText(node, parentGroup, sectionName, inheritedFontFamily) {
        var layer = parentGroup
            ? parentGroup.artLayers.add()
            : DOC.artLayers.add();

        layer.kind = LayerKind.TEXT;

        var item = layer.textItem;
        var text = node.text || {};
        var contents = String(text.contents == null ? "" : text.contents);
        var paragraphText = String(text.mode || "point").toLowerCase() === "paragraph";

        layer.name = node.name || contents || "Text";
        item.kind = paragraphText ? TextType.PARAGRAPHTEXT : TextType.POINTTEXT;
        item.contents = contents;

        if (contents) {
            try {
                layer.name = contents;
            } catch (nameError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not set text layer name to its contents for '" +
                    String(node.name || node.id || "Text") + "': " +
                    safeMessage(nameError)
                );
            }
        }

        // Photoshop TextItem.font expects a PostScript name. Prefer the exact
        // face Chromium actually used for these glyphs, then resolve the CSS
        // face name only when browser font diagnostics are unavailable. Never
        // select a different family or synthesize a weight.
        var requestedPostScriptName = String(text.postScriptName || "");
        var requestedFamily = String(text.family || inheritedFontFamily || "");
        var browserRenderedPostScriptName = String(text.renderedPostScriptName || "");
        var resolvedPostScriptName = requestedPostScriptName || browserRenderedPostScriptName;

        if (!resolvedPostScriptName && requestedFamily) {
            var fontResolution = resolveInstalledFont(requestedFamily);
            resolvedPostScriptName = String(fontResolution.postScriptName || "");
            if (!resolvedPostScriptName) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not resolve requested font face '" + requestedFamily +
                    "' to an installed Photoshop PostScript font name: " +
                    fontResolution.reason +
                    ". No replacement or synthetic weight was applied. " +
                    "Set data-ps-font-postscript when the exact PostScript name is known."
                );
            }
        }

        if (resolvedPostScriptName) {
            try {
                item.font = resolvedPostScriptName;
            } catch (fontError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Photoshop could not apply requested font '" +
                    String(requestedPostScriptName || browserRenderedPostScriptName || requestedFamily) +
                    "' using PostScript name '" + resolvedPostScriptName +
                    "' to layer '" + layer.name +
                    "'. No replacement/rasterization was performed. " +
                    safeMessage(fontError)
                );
            }
        }

        // At 72 PPI, 1 point maps directly to 1 image pixel for our handoff
        // geometry.

        item.size = pt(Number(text.sizePx || 16));

        if (text.lineHeightPx != null && Number(text.lineHeightPx) > 0) {
            try {
                item.useAutoLeading = false;
            } catch (autoLeadingError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not disable Photoshop auto leading for '" + layer.name + "': " +
                    safeMessage(autoLeadingError)
                );
            }

            try {
                item.leading = pt(Number(text.lineHeightPx));
            } catch (leadingError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not apply line-height to '" + layer.name + "': " +
                    safeMessage(leadingError)
                );
            }
        }

        if (
            text.letterSpacingPx != null &&
            Number(text.sizePx || 0) > 0
        ) {
            try {
                item.tracking = Math.round(
                    Number(text.letterSpacingPx) /
                    Number(text.sizePx) *
                    1000
                );
            } catch (trackingError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not apply letter spacing to '" + layer.name + "': " +
                    safeMessage(trackingError)
                );
            }
        }

        try {
            item.justification = mapJustification(text.align);
        } catch (justificationError) {
            warn(
                nodeContext(node, sectionName) +
                " Could not apply text justification: " + safeMessage(justificationError)
            );
        }

        if (text.color) {
            try {
                item.color = solidColor(text.color);
            } catch (colorError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not apply text color: " + safeMessage(colorError)
                );
            }
        }

        if (paragraphText) {
            item.position = [
                px(Number(node.bounds.x)),
                px(Number(node.bounds.y))
            ];

            try {
                item.width = px(Math.max(1, Number(node.layoutWidth || node.bounds.width)));
                item.height = px(Math.max(1, Number(node.layoutHeight || node.bounds.height)));
            } catch (boxError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not apply paragraph box size to '" + layer.name + "': " +
                    safeMessage(boxError)
                );
            }
        } else {
            var align = String(text.align || "left").toLowerCase();
            var anchorX = Number(node.bounds.x);
            if (align === "center") {
                anchorX += Number(node.bounds.width) / 2;
            } else if (align === "right" || align === "end") {
                anchorX += Number(node.bounds.width);
            }

            item.position = [
                px(anchorX),
                px(Number(node.bounds.y) + Number(text.sizePx || 16))
            ];

            try {
                var pointBounds = boundsPx(layer);
                var targetX = Number(node.bounds.x);
                if (align === "center") {
                    targetX += (Number(node.bounds.width) - pointBounds.width) / 2;
                } else if (align === "right" || align === "end") {
                    targetX += Number(node.bounds.width) - pointBounds.width;
                }

                layer.translate(
                    px(targetX - pointBounds.left),
                    px(Number(node.bounds.y) - pointBounds.top)
                );
            } catch (positionError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not align point text '" + layer.name + "' to browser bounds: " +
                    safeMessage(positionError)
                );
            }
        }

        var textScaleX = Number(node.scaleX == null ? 1 : node.scaleX);
        var textScaleY = Number(node.scaleY == null ? 1 : node.scaleY);
        var textRotation = Number(node.rotation || 0);
        if (
            Math.abs(textScaleX - 1) > 0.001 ||
            Math.abs(textScaleY - 1) > 0.001
        ) {
            try {
                layer.resize(
                    Math.max(0.01, textScaleX) * 100,
                    Math.max(0.01, textScaleY) * 100,
                    AnchorPosition.MIDDLECENTER
                );
            } catch (scaleError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not apply text transform scale to '" + layer.name + "': " +
                    safeMessage(scaleError)
                );
            }
        }

        if (Math.abs(textRotation) > 0.001) {
            try {
                layer.rotate(textRotation, AnchorPosition.MIDDLECENTER);
            } catch (rotationError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not apply text rotation to '" + layer.name + "': " +
                    safeMessage(rotationError)
                );
            }
        }

        if (
            Math.abs(textScaleX - 1) > 0.001 ||
            Math.abs(textScaleY - 1) > 0.001 ||
            Math.abs(textRotation) > 0.001
        ) {
            try {
                var transformedCenter = centerOfBounds(layer);
                var browserCenterX = Number(node.bounds.x) + Number(node.bounds.width) / 2;
                var browserCenterY = Number(node.bounds.y) + Number(node.bounds.height) / 2;
                layer.translate(
                    px(browserCenterX - transformedCenter.x),
                    px(browserCenterY - transformedCenter.y)
                );
            } catch (transformPositionError) {
                warn(
                    nodeContext(node, sectionName) +
                    " Could not align transformed text '" + layer.name + "': " +
                    safeMessage(transformPositionError)
                );
            }
        }

        try {
            var colorOpacity = text.color && text.color.a != null
                ? Number(text.color.a)
                : 1;
            layer.opacity = Math.max(
                0,
                Math.min(
                    100,
                    Number(node.opacity == null ? 1 : node.opacity) * colorOpacity * 100
                )
            );
        } catch (opacityError) {
            warn(
                nodeContext(node, sectionName) +
                " Could not apply text opacity: " + safeMessage(opacityError)
            );
        }

        return layer;
    }

    function sortChildren(children) {
        var result = children && typeof children.slice === "function"
            ? children.slice(0)
            : [];
        result.sort(function (a, b) {
            var aOrder = 0;
            var bOrder = 0;
            try { aOrder = Number(a && a.paintOrder || 0); } catch (_) {}
            try { bOrder = Number(b && b.paintOrder || 0); } catch (_) {}
            return aOrder - bOrder;
        });
        return result;
    }

    function skippedBounds(node) {
        var bounds = node && node.bounds || {};
        return "x=" + round(bounds.x) + ", y=" + round(bounds.y) +
            ", w=" + round(bounds.width) + ", h=" + round(bounds.height);
    }

    function createNodeUnsafe(node, parentGroup, sectionName, inheritedFontFamily) {
        if (!node) {
            throw new Error("Scene node is missing.");
        }

        if (node.mode === "skipped") {
            fail(
                nodeContext(node, sectionName) +
                " Skipped; reserved bounds: " + skippedBounds(node) +
                ". Reason: " + String(node.fallbackReason || "unknown")
            );
            return null;
        }

        if (node.type === "group") {
            var children = sortChildren(node.children || []);
            var childFontFamily = String(node.fontFamily || inheritedFontFamily || "");
            var group = null;
            try {
                group = addGroup(node.name, parentGroup);
            } catch (groupError) {
                fail(
                    nodeContext(node, sectionName) +
                    " Group creation failed; children will be created in the parent group. " +
                    safeMessage(groupError)
                );
            }
            if (group) {
                try {
                group.opacity = Math.max(
                    0,
                    Math.min(100, Number(node.opacity == null ? 1 : node.opacity) * 100)
                );
                } catch (groupOpacityError) {
                    warn(
                    nodeContext(node, sectionName) +
                        " Could not apply group opacity: " + safeMessage(groupOpacityError)
                    );
                }
            }
            for (var i = 0; i < children.length; i++) {
                // createNode is the mandatory isolation boundary. It never lets
                // one child failure escape and stop its later siblings.
                createNode(children[i], group || parentGroup, sectionName, childFontFamily);
            }
            return group;
        }

        if (node.type === "text") {
            return createText(node, parentGroup, sectionName, inheritedFontFamily);
        }

        if (node.type === "image") {
            if (!node.image || !node.image.assetPath) {
                throw new Error("Image asset path is missing.");
            }
            return createSmart(
                node,
                parentGroup,
                node.image.assetPath,
                Number(node.renderWidth || node.bounds.width),
                Number(node.renderHeight || node.bounds.height),
                Number(node.rotation || 0),
                sectionName
            );
        }

        if (node.type === "raster") {
            if (!node.rasterPath) {
                throw new Error("Raster fallback path is missing.");
            }
            return createSmart(
                node,
                parentGroup,
                node.rasterPath,
                Number(node.bounds.width),
                Number(node.bounds.height),
                0,
                sectionName
            );
        }

        if (node.type === "shape") {
            return createRasterShape(node, parentGroup, sectionName);
        }

        throw new Error("Unsupported node type: " + node.type);
    }

    function createNode(node, parentGroup, sectionName, inheritedFontFamily) {
        try {
            return createNodeUnsafe(node, parentGroup, sectionName, inheritedFontFamily);
        } catch (error) {
            fail(
                nodeContext(node, sectionName) +
                " Creation failed; reserved bounds remain valid. " +
                safeMessage(error)
            );
            return null;
        }
    }

    function placeReference() {
        ensureCanvasHeight(SCENE.canvas.height);

        var referenceNode = {
            id: "browser-reference",
            type: "raster",
            name: "[REFERENCE] Browser Render - DO NOT EDIT",
            locator: "reference.png",
            bounds: {
                x: 0,
                y: 0,
                width: SCENE.canvas.width,
                height: SCENE.canvas.height
            },
            opacity: 1
        };

        var layer = createSmart(
            referenceNode,
            null,
            SCENE.referenceImage,
            SCENE.canvas.width,
            SCENE.canvas.height,
            0,
            "<reference>"
        );

        if (!layer) return;

        layer.name = "[REFERENCE] Browser Render - DO NOT EDIT";
        layer.visible = false;

        try {
            layer.allLocked = true;
        } catch (lockError) {
            warn(
                nodeContext(referenceNode, "<reference>") +
                " Could not lock the browser reference layer: " + safeMessage(lockError)
            );
        }
    }

    function writeReport(fatalMessage) {
        try {
            var file = new File(resolvePackagePath(REPORT_PATH));
            file.encoding = "UTF8";
            if (!file.open("w")) return;

            file.writeln("html-to-ps handoff report");
            file.writeln("========================");
            file.writeln("");
            file.writeln("Target: Photoshop 2024");
            file.writeln("Canvas: " + SCENE.canvas.width + "px wide / 72 PPI");
            file.writeln("");

            if (fatalMessage) {
                file.writeln("FATAL");
                file.writeln(fatalMessage);
                file.writeln("");
            }

            file.writeln("WARNINGS (" + WARNINGS.length + ")");
            for (var i = 0; i < WARNINGS.length; i++) {
                file.writeln("- " + WARNINGS[i]);
            }

            file.writeln("");
            file.writeln("ERRORS / SKIPPED (" + ERRORS.length + ")");
            for (var j = 0; j < ERRORS.length; j++) {
                file.writeln("- " + ERRORS[j]);
            }

            file.close();
        } catch (_) {}
    }

    function main() {
        app.displayDialogs = DialogModes.NO;

        var initial = Math.max(
            1,
            Math.min(
                Number(SCENE.canvas.height),
                Number(INITIAL_HEIGHT)
            )
        );

        DOC = app.documents.add(
            px(SCENE.canvas.width),
            px(initial),
            Number(SCENE.canvas.resolution || 72),
            DOCUMENT_NAME,
            NewDocumentMode.RGB,
            DocumentFill.TRANSPARENT
        );

        for (var i = 0; i < (SCENE.warnings || []).length; i++) {
            warn(SCENE.warnings[i]);
        }

        var sections = SCENE.sections || [];
        for (var s = 0; s < sections.length; s++) {
            var section = sections[s];
            var sectionName = "Section " + (s + 1);

            try {
                if (section) {
                    sectionName = String(section.name || section.id || sectionName);
                }
                // Canvas expansion occurs once per top-level section. TOPCENTER
                // preserves y=0 so all Chromium geometry remains valid.
                var sectionBounds = section && section.bounds || {};
                ensureCanvasHeight(
                    Number(section && section.requiredBottom || sectionBounds.bottom || 0)
                );

                createNode(section, null, sectionName, "");
            } catch (sectionError) {
                fail(
                    nodeContext(section, sectionName) +
                    " Section processing failed; continuing with the next section. " +
                    safeMessage(sectionError)
                );
            }
        }

        try {
            ensureCanvasHeight(SCENE.canvas.height);
        } catch (canvasError) {
            fail("[section: <document>] [element: final canvas] Resize failed. " + safeMessage(canvasError));
        }

        try {
            placeReference();
        } catch (referenceError) {
            fail("[section: <reference>] [element: browser reference] Placement failed. " + safeMessage(referenceError));
        }

        writeReport(null);

        if (WARNINGS.length || ERRORS.length) {
            alert(
                "html-to-ps handoff completed with " +
                WARNINGS.length + " warning(s) and " +
                ERRORS.length + " skipped/failed node(s).\\n\\n" +
                "See handoff-report.txt next to the generated JSX.",
                "html-to-ps"
            );
        } else {
            alert(
                "html-to-ps handoff completed.\\n\\n" +
                "The browser reference layer was added at the top and hidden.\\n" +
                "Continue all subsequent editing in Photoshop.",
                "html-to-ps"
            );
        }
    }

    try {
        main();
    } catch (fatalError) {
        var message = safeMessage(fatalError);
        writeReport(message);
        alert("html-to-ps handoff failed:\\n\\n" + message, "html-to-ps error", true);
        throw fatalError;
    }
})();
`;

    await fs.mkdir(path.dirname(jsxPath), { recursive: true });
    await fs.writeFile(jsxPath, jsx.trimStart(), "utf8");
}
