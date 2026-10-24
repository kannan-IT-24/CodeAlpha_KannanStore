// ==========================================
// KannanStore - API Endpoints Verification Script
// ==========================================
// Run this script in terminal: node test-endpoints.js
// It tests all endpoints to ensure they are working properly.

const http = require("http");

function request(url) {
    return new Promise((resolve) => {
        http.get(url, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
                let parsed;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    parsed = body;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        }).on("error", (err) => {
            resolve({ status: "ERROR", error: err.message });
        });
    });
}

async function runTests() {
    console.log("==========================================");
    console.log("🧪 Testing KannanStore Backend Endpoints");
    console.log("==========================================\n");

    // 1. Root route
    const rootRes = await request("http://localhost:3000/");
    console.log("1. GET /");
    console.log(`   Status: ${rootRes.status}`);
    console.log(`   Response: ${JSON.stringify(rootRes.data)}\n`);

    // 2. Hello route
    const helloRes = await request("http://localhost:3000/hello");
    console.log("2. GET /hello");
    console.log(`   Status: ${helloRes.status}`);
    console.log(`   Response: ${JSON.stringify(helloRes.data)}\n`);

    // 3. Products list (from MongoDB)
    const productsRes = await request("http://localhost:3000/products");
    console.log("3. GET /products (from MongoDB Atlas)");
    console.log(`   Status: ${productsRes.status}`);
    if (Array.isArray(productsRes.data)) {
        console.log(`   Found ${productsRes.data.length} products in MongoDB:`);
        productsRes.data.forEach((p) => {
            console.log(`   - [ID ${p.id}] ${p.name} — ₹${p.price} (MongoDB _id: ${p._id})`);
        });
    } else {
        console.log(`   Response:`, productsRes.data);
    }
    console.log("");

    // 4. Product by numeric ID
    const prod1Res = await request("http://localhost:3000/products/1");
    console.log("4. GET /products/1 (Search by numeric ID)");
    console.log(`   Status: ${prod1Res.status}`);
    console.log(`   Product:`, prod1Res.data);
    console.log("");

    // 5. Product by MongoDB ObjectId (if products exist)
    if (Array.isArray(productsRes.data) && productsRes.data.length > 0) {
        const firstObjectId = productsRes.data[0]._id;
        const objIdRes = await request(`http://localhost:3000/products/${firstObjectId}`);
        console.log(`5. GET /products/${firstObjectId} (Search by 24-char MongoDB ObjectId)`);
        console.log(`   Status: ${objIdRes.status}`);
        console.log(`   Product:`, objIdRes.data);
        console.log("");
    }

    // 6. Non-existent product ID (404 test)
    const notFoundRes = await request("http://localhost:3000/products/999");
    console.log("6. GET /products/999 (Non-existent product - Expected: 404)");
    console.log(`   Status: ${notFoundRes.status}`);
    console.log(`   Response:`, notFoundRes.data);
    console.log("");

    // 7. Invalid ID format (400 validation test)
    const invalidRes = await request("http://localhost:3000/products/invalid-id-xyz");
    console.log("7. GET /products/invalid-id-xyz (Invalid format - Expected: 400)");
    console.log(`   Status: ${invalidRes.status}`);
    console.log(`   Response:`, invalidRes.data);
    console.log("");

    console.log("==========================================");
    console.log("✅ All Endpoint Tests Completed!");
    console.log("==========================================");
}

runTests();
