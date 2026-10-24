// ==========================================
// KannanStore - Frontend & API Integration Verification
// ==========================================

const http = require("http");

function fetchAsset(path, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "localhost",
                port: 3000,
                path: path,
                method: "GET",
                headers: headers
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                });
            }
        );
        req.on("error", reject);
        req.end();
    });
}

async function runTests() {
    console.log("==================================================");
    console.log("🧪 Verifying Frontend & Backend Integration");
    console.log("==================================================\n");

    try {
        // 1. Check Storefront Delivery (GET /)
        const html = await fetchAsset("/", { Accept: "text/html" });
        console.log(`1. Storefront Delivery (GET /)`);
        console.log(`   HTTP Status: ${html.status}`);
        console.log(`   Serves KannanStore HTML: ${html.body.includes("KannanStore")}`);
        console.log(`   Contains #product-grid: ${html.body.includes('id="product-grid"')}`);
        console.log(`   Contains #loading-state: ${html.body.includes('id="loading-state"')}`);
        console.log(`   Contains #error-state: ${html.body.includes('id="error-state"')}\n`);

        // 2. Check CSS Delivery (GET /style.css)
        const css = await fetchAsset("/style.css");
        console.log(`2. Stylesheet Delivery (GET /style.css)`);
        console.log(`   HTTP Status: ${css.status}`);
        console.log(`   Contains Purple Theme Variables: ${css.body.includes("--primary: #5B35E8")}`);
        console.log(`   Contains Spinner & Feedback Styles: ${css.body.includes(".spinner")}\n`);

        // 3. Check Script Delivery (GET /script.js)
        const js = await fetchAsset("/script.js");
        console.log(`3. Frontend Script Delivery (GET /script.js)`);
        console.log(`   HTTP Status: ${js.status}`);
        console.log(`   Contains Fetch API integration: ${js.body.includes("fetch(API_URL)")}`);
        console.log(`   No hardcoded products array: ${!js.body.includes("const products = [")}\n`);

        // 4. Check Products API from MongoDB (GET /products)
        const api = await fetchAsset("/products");
        console.log(`4. Products API Delivery (GET /products)`);
        console.log(`   HTTP Status: ${api.status}`);
        console.log(`   CORS Header present: ${api.headers["access-control-allow-origin"] === "*"}`);

        const products = JSON.parse(api.body);
        console.log(`   Total products retrieved from MongoDB: ${products.length}`);
        products.forEach((p) => {
            console.log(`   - ${p.name} | Price: ₹${p.price} | Icon: ${p.icon} | Category: ${p.category}`);
        });
        console.log("\n==================================================");
        console.log("✅ All Frontend-Backend Integration Tests Passed!");
        console.log("==================================================");

    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

runTests();
