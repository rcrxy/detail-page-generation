import assert from "node:assert/strict";
import { chromium } from "playwright";
import { validateSpecializedPage } from "../src/protocol.mjs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

function documentHtml(rootAttributes = "", childHtml = "") {
    return `<!doctype html><html><head><style>html,body{margin:0}</style></head><body>
<main id="detail-page" style="position:relative;width:1500px;height:100px" ${rootAttributes}>
  <section data-ps-group="Section" data-ps-source-id="source-section" style="position:relative;width:1500px;height:100px">
    ${childHtml}
  </section>
</main></body></html>`;
}

async function expectFailure(html, pattern) {
    await page.setContent(html);
    await assert.rejects(() => validateSpecializedPage(page), pattern);
}

try {
    await page.setContent(
        documentHtml(
            'data-ps-specialized-version="0.1" data-ps-source="./source.html" data-ps-required-capabilities="shape-fill"',
            '<div data-ps-role="shape" data-ps-shape-kind="rectangle" data-ps-source-id="source-shape" style="position:absolute;left:0;top:0;width:10px;height:10px;background:#000"></div>',
        ),
    );
    const valid = await validateSpecializedPage(page);
    assert.equal(valid.protocolVersion, "0.1");
    assert.deepEqual(valid.requiredCapabilities, ["shape-fill"]);

    await expectFailure(documentHtml('data-ps-source="./source.html"'), /data-ps-specialized-version/);
    await expectFailure(
        documentHtml('data-ps-specialized-version="9.9" data-ps-source="./source.html"'),
        /Unsupported specialized protocol version/,
    );
    await expectFailure(
        documentHtml(
            'data-ps-specialized-version="0.1" data-ps-source="./source.html" data-ps-required-capabilities="unknown-capability"',
        ),
        /Unsupported required capability/,
    );
    await expectFailure(
        documentHtml(
            'data-ps-specialized-version="0.1" data-ps-source="./source.html"',
            '<div data-ps-role="widget" data-ps-source-id="source-widget" style="width:10px;height:10px;background:#000"></div>',
        ),
        /invalid data-ps-role/,
    );
    await expectFailure(
        documentHtml(
            'data-ps-specialized-version="0.1" data-ps-source="./source.html"',
            '<div data-ps-role="shape" data-ps-shape-kind="triangle" data-ps-source-id="source-shape" style="width:10px;height:10px;background:#000"></div>',
        ),
        /invalid or missing data-ps-shape-kind/,
    );
    await expectFailure(
        documentHtml(
            'data-ps-specialized-version="0.1" data-ps-source="./source.html"',
            '<div data-ps-role="shape" data-ps-shape-kind="rectangle" style="width:10px;height:10px;background:#000"></div>',
        ),
        /must declare data-ps-source-id/,
    );
    await expectFailure(
        documentHtml(
            'data-ps-specialized-version="0.1" data-ps-source="./source.html"',
            '<p data-ps-role="text" data-ps-source-id="source-text" style="font-family:Arial;font-size:20px;line-height:24px;letter-spacing:0px;font-weight:700">Text</p>',
        ),
        /font-weight/,
    );

    console.log("protocol preflight: ok");
} finally {
    await browser.close();
}
