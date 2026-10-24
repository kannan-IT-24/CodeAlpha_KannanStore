// ==========================================
// KannanStore - Order Placement Automated Tests
// ==========================================
const http = require("http");
const { app, connectDB } = require("./server");

function request({ method, path, port, body }) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: "localhost",
            port: port,
            path: path,
            method: method || "GET",
            headers: {
                "Content-Type": "application/json",
                ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
            }
        };

        const req = http.request(options, (res) => {
            let resBody = "";
            res.on("data", (chunk) => (resBody += chunk));
            res.on("end", () => {
                let parsed;
                try {
                    parsed = JSON.parse(resBody);
                } catch {
                    parsed = resBody;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on("error", (err) => reject(err));
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function runTests() {
    console.log("==========================================");
    console.log("🧪 Running KannanStore Orders Automated Tests");
    console.log("==========================================\n");

    // 1. Connect DB and start test server
    console.log("Connecting to database...");
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error("❌ Failed to connect to MongoDB Atlas for test.");
        process.exit(1);
    }

    const testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    console.log(`Test server active on ephemeral port ${port}\n`);

    let passedTests = 0;
    let failedTests = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedTests++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failedTests++;
        }
    }

    try {
        // Test 1: Reject empty customer details
        console.log("Test 1: Reject missing customer details (HTTP 400)");
        const res1 = await request({
            method: "POST",
            path: "/orders",
            port,
            body: {
                items: [{ id: 1, quantity: 1 }]
            }
        });
        assert(res1.status === 400, "Returns HTTP 400 on missing customer");
        assert(res1.data.error.includes("Customer details"), "Returns clear customer error message");

        // Test 2: Reject invalid email
        console.log("\nTest 2: Reject invalid email address (HTTP 400)");
        const res2 = await request({
            method: "POST",
            path: "/orders",
            port,
            body: {
                customer: {
                    name: "Kannan G",
                    email: "not-an-email",
                    phone: "9876543210",
                    address: "123 Main Street"
                },
                items: [{ id: 1, quantity: 1 }]
            }
        });
        assert(res2.status === 400, "Returns HTTP 400 on invalid email");

        // Test 3: Reject empty cart items
        console.log("\nTest 3: Reject empty items array (HTTP 400)");
        const res3 = await request({
            method: "POST",
            path: "/orders",
            port,
            body: {
                customer: {
                    name: "Kannan G",
                    email: "kannan@example.com",
                    phone: "9876543210",
                    address: "123 Main Street"
                },
                items: []
            }
        });
        assert(res3.status === 400, "Returns HTTP 400 on empty items array");

        // Test 4: Reject non-existent product ID
        console.log("\nTest 4: Reject invalid / non-existent product ID (HTTP 404)");
        const res4 = await request({
            method: "POST",
            path: "/orders",
            port,
            body: {
                customer: {
                    name: "Kannan G",
                    email: "kannan@example.com",
                    phone: "9876543210",
                    address: "123 Main Street"
                },
                items: [{ id: 99999, quantity: 1 }]
            }
        });
        assert(res4.status === 404, "Returns HTTP 404 when product is not in database");

        // Test 5: PRICE TAMPER PROTECTION (Crucial Security Check)
        // Client attempts to send fake price of ₹10 instead of real ₹1499 for Wireless Headphones (id: 1)
        console.log("\nTest 5: Price Tamper Protection (Server ignores client price)");
        const res5 = await request({
            method: "POST",
            path: "/orders",
            port,
            body: {
                customer: {
                    name: "Test Customer",
                    email: "security-test@example.com",
                    phone: "9876543210",
                    address: "77 Cyber Avenue, Tech Park"
                },
                items: [
                    { id: 1, quantity: 2, price: 10, name: "Free Item", total: 20 }
                ]
            }
        });
        assert(res5.status === 201, "Order created successfully (HTTP 201)");
        assert(res5.data.order.items[0].price === 1499, "Server used database price (₹1499) not client price (₹10)");
        assert(res5.data.order.total === 2998, "Server calculated true total: 2 × ₹1499 = ₹2998");
        assert(res5.data.order.items[0].name === "Wireless Headphones", "Server used authentic database product name");

        // Test 6: Successful multi-item order placement
        console.log("\nTest 6: Multi-item Order Placement and MongoDB persistence");
        const res6 = await request({
            method: "POST",
            path: "/orders",
            port,
            body: {
                customer: {
                    name: "Kannan Student",
                    email: "kannan@kannanstore.local",
                    phone: "9123456789",
                    address: "Flat 4B, Emerald Heights, Chennai"
                },
                items: [
                    { id: 1, quantity: 1 }, // 1499
                    { id: 3, quantity: 2 }  // 999 * 2 = 1998 -> Total = 3497
                ]
            }
        });
        assert(res6.status === 201, "Returns HTTP 201 on valid order");
        assert(res6.data.success === true, "Response has success: true");
        assert(Boolean(res6.data.orderId), "Response contains MongoDB generated orderId");
        assert(res6.data.order.total === 3497, "Calculated total matches: ₹1499 + (₹999 * 2) = ₹3497");
        assert(res6.data.order.status === "confirmed", "Order status is 'confirmed'");

        const createdOrderId = res6.data.orderId;

        // Test 7: Verify order retrieval via GET /orders/:id
        console.log(`\nTest 7: Fetch created order via GET /orders/${createdOrderId}`);
        const res7 = await request({
            method: "GET",
            path: `/orders/${createdOrderId}`,
            port
        });
        assert(res7.status === 200, "Returns HTTP 200 on valid order fetch");
        assert(res7.data.total === 3497, "Retrieved order total matches ₹3497");
        assert(res7.data.items.length === 2, "Retrieved order contains 2 verified items");
        assert(res7.data.customer.name === "Kannan Student", "Customer name matches");

        console.log("\n==========================================");
        console.log(`Test Results: ${passedTests} PASSED, ${failedTests} FAILED`);
        console.log("==========================================");

        testServer.close();
        process.exit(failedTests === 0 ? 0 : 1);
    } catch (err) {
        console.error("Unexpected test execution error:", err);
        testServer.close();
        process.exit(1);
    }
}

runTests();
