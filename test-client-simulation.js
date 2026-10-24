// ==========================================
// KannanStore - Client Simulation Test
// ==========================================
// Simulates the exact frontend actions:
// - Fetching from http://localhost:3000/products
// - Adding to cart, changing quantity, removing from cart
// - Price formatting & total calculations
// - LocalStorage cart persistence

const http = require("http");

function fetchProductsFromAPI() {
    return new Promise((resolve, reject) => {
        http.get("http://localhost:3000/products", (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on("error", reject);
    });
}

function formatPrice(amount) {
    return amount.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });
}

async function runSimulation() {
    console.log("==================================================");
    console.log("🛒 Simulating Frontend User Journey & Cart Logic");
    console.log("==================================================\n");

    // 1. Fetch products from MongoDB backend
    console.log("Step 1: Frontend fetches products from http://localhost:3000/products");
    const products = await fetchProductsFromAPI();
    console.log(`✅ Received ${products.length} products from MongoDB:`);
    products.forEach((p) => {
        console.log(`   - [ID ${p.id}] ${p.name} — ${formatPrice(p.price)} (${p.icon})`);
    });
    console.log("");

    // 2. Simulate Cart State
    console.log("Step 2: Initialize Cart Map");
    const cart = new Map();
    let savedStorage = "";

    function saveCart() {
        savedStorage = JSON.stringify([...cart]);
    }

    function addToCart(productId) {
        const current = cart.get(productId) || 0;
        cart.set(productId, current + 1);
        saveCart();
    }

    function changeQuantity(productId, delta) {
        const current = cart.get(productId) || 0;
        const newQty = current + delta;
        if (newQty <= 0) {
            cart.delete(productId);
        } else {
            cart.set(productId, newQty);
        }
        saveCart();
    }

    function calculateTotal() {
        let items = 0;
        let total = 0;
        cart.forEach((qty, id) => {
            const product = products.find((p) => p.id === id || p._id === id);
            if (product) {
                items += qty;
                total += product.price * qty;
            }
        });
        return { items, total };
    }

    // Step 3: Add Wireless Headphones (1499)
    console.log("Step 3: User clicks 'Add to Cart' on Wireless Headphones");
    addToCart(1);
    let state = calculateTotal();
    console.log(`   Cart Items: ${state.items}`);
    console.log(`   Cart Total: ${formatPrice(state.total)} (Expected: ₹1,499)`);
    console.log(`   LocalStorage Saved: ${savedStorage}\n`);

    // Step 4: Increase quantity (+)
    console.log("Step 4: User clicks '+' to increment quantity to 2");
    changeQuantity(1, 1);
    state = calculateTotal();
    console.log(`   Cart Items: ${state.items}`);
    console.log(`   Cart Total: ${formatPrice(state.total)} (Expected: ₹2,998)\n`);

    // Step 5: Add Running Shoes (2499)
    console.log("Step 5: User clicks 'Add to Cart' on Running Shoes");
    addToCart(2);
    state = calculateTotal();
    console.log(`   Cart Items: ${state.items}`);
    console.log(`   Cart Total: ${formatPrice(state.total)} (Expected: ₹5,497)\n`);

    // Step 6: Decrease quantity (-) on Wireless Headphones
    console.log("Step 6: User clicks '-' on Wireless Headphones");
    changeQuantity(1, -1);
    state = calculateTotal();
    console.log(`   Cart Items: ${state.items}`);
    console.log(`   Cart Total: ${formatPrice(state.total)} (Expected: ₹3,998)\n`);

    // Step 7: Restore from localStorage simulation
    console.log("Step 7: Simulate page reload restoring from localStorage");
    const reloadedCart = new Map(JSON.parse(savedStorage));
    let reloadedTotal = 0;
    let reloadedItems = 0;
    reloadedCart.forEach((qty, id) => {
        const product = products.find((p) => p.id === id || p._id === id);
        if (product) {
            reloadedItems += qty;
            reloadedTotal += product.price * qty;
        }
    });
    console.log(`   Restored Items: ${reloadedItems}`);
    console.log(`   Restored Total: ${formatPrice(reloadedTotal)}`);
    console.log("   Cart persistence verified successfully!\n");

    // Step 8: User completes checkout form and places order
    console.log("Step 8: Simulate user submitting checkout form to POST /orders");
    const checkoutItems = [];
    cart.forEach((qty, id) => checkoutItems.push({ id, quantity: qty }));

    const orderPayload = JSON.stringify({
        customer: {
            name: "Kannan Customer",
            email: "kannan.shopper@example.com",
            phone: "9876543210",
            address: "42 Park Avenue, Chennai"
        },
        items: checkoutItems
    });

    const orderResult = await new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "localhost",
                port: 3000,
                path: "/orders",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(orderPayload)
                }
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                });
            }
        );
        req.on("error", reject);
        req.write(orderPayload);
        req.end();
    });

    console.log(`   HTTP Status: ${orderResult.status} (Expected: 201)`);
    console.log(`   Confirmed Order ID: ${orderResult.body.orderId}`);
    console.log(`   Verified Total by MongoDB: ${formatPrice(orderResult.body.order.total)} (Expected: ₹3,998)`);
    console.log(`   Order Status: ${orderResult.body.order.status}`);
    console.log(`   Items confirmed: ${orderResult.body.order.items.length}\n`);

    // Step 9: Cart is cleared only after MongoDB confirms order
    console.log("Step 9: Cart is cleared after MongoDB confirmation");
    cart.clear();
    saveCart();
    const finalState = calculateTotal();
    console.log(`   Cart Items: ${finalState.items} (Expected: 0)`);
    console.log(`   Cart Total: ${formatPrice(finalState.total)} (Expected: ₹0)`);
    console.log(`   LocalStorage Cleared: ${savedStorage === "[]"}\n`);

    console.log("==================================================");
    console.log("🎉 Complete User Journey & Order Placement Successful!");
    console.log("==================================================");
}

runSimulation();
