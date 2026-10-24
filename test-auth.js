// ==========================================
// KannanStore - Authentication & Security Automated Tests
// ==========================================
const http = require("http");
const { app, connectDB } = require("./server");

function request({ method, path, port, body, headers = {} }) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: "localhost",
            port: port,
            path: path,
            method: method || "GET",
            headers: {
                "Content-Type": "application/json",
                ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
                ...headers
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
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data: parsed
                });
            });
        });

        req.on("error", reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function runTests() {
    console.log("==========================================");
    console.log("🔐 Running KannanStore Auth Automated Tests");
    console.log("==========================================\n");

    console.log("Connecting to database...");
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error("❌ Failed to connect to MongoDB Atlas for auth tests.");
        process.exit(1);
    }

    const testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    console.log(`Auth test server running on port ${port}\n`);

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

    // Unique email for testing
    const testTimestamp = Date.now();
    const testEmail = `kannan.user.${testTimestamp}@example.com`;
    const testPassword = "SecurePassword@123";
    const testName = "Kannan Test User";

    try {
        // Test 1: Reject registration with missing fields
        console.log("Test 1: Reject registration with missing fields (HTTP 400)");
        const regMissing = await request({
            method: "POST",
            path: "/auth/register",
            port,
            body: { email: testEmail, password: testPassword } // missing name
        });
        assert(regMissing.status === 400, "Returns HTTP 400 when name is missing");

        // Test 2: Reject registration with invalid email
        console.log("\nTest 2: Reject registration with invalid email format (HTTP 400)");
        const regBadEmail = await request({
            method: "POST",
            path: "/auth/register",
            port,
            body: { name: testName, email: "invalid-email-format", password: testPassword }
        });
        assert(regBadEmail.status === 400, "Returns HTTP 400 on malformed email");

        // Test 3: Reject registration with short password (< 6 chars)
        console.log("\nTest 3: Reject registration with weak/short password (HTTP 400)");
        const regShortPass = await request({
            method: "POST",
            path: "/auth/register",
            port,
            body: { name: testName, email: testEmail, password: "123" }
        });
        assert(regShortPass.status === 400, "Returns HTTP 400 on password shorter than 6 chars");

        // Test 4: Successful user registration
        console.log("\nTest 4: Successful user registration (HTTP 201)");
        const regSuccess = await request({
            method: "POST",
            path: "/auth/register",
            port,
            body: { name: testName, email: testEmail, password: testPassword }
        });
        assert(regSuccess.status === 201, "Returns HTTP 201 on valid registration");
        assert(regSuccess.data.success === true, "Response has success: true");
        assert(Boolean(regSuccess.data.user?.id), "Response contains user id");
        assert(regSuccess.data.user.email === testEmail.toLowerCase(), "Email is normalized to lowercase");
        assert(!regSuccess.data.user.password && !regSuccess.data.user.passwordHash, "NEVER returns password or passwordHash in response");

        // Check HttpOnly Cookie
        const setCookieHeader = regSuccess.headers["set-cookie"];
        assert(Boolean(setCookieHeader), "Sets auth cookie in header");
        const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader.join("; ") : setCookieHeader;
        assert(cookieStr.includes("HttpOnly"), "Auth cookie has HttpOnly flag");
        assert(cookieStr.includes("SameSite=Lax"), "Auth cookie has SameSite=Lax flag");

        // Test 5: Prevent duplicate registration for the same normalized email (HTTP 409)
        console.log("\nTest 5: Prevent duplicate registration for existing email (HTTP 409)");
        const regDuplicate = await request({
            method: "POST",
            path: "/auth/register",
            port,
            body: { name: "Another Person", email: testEmail.toUpperCase(), password: "AnotherPassword123" }
        });
        assert(regDuplicate.status === 409, "Returns HTTP 409 Conflict on duplicate email");
        assert(regDuplicate.data.error.includes("already exists"), "Returns clear error for duplicate account");

        // Test 6: Successful login with correct credentials
        console.log("\nTest 6: Successful user login (HTTP 200)");
        const loginSuccess = await request({
            method: "POST",
            path: "/auth/login",
            port,
            body: { email: testEmail, password: testPassword }
        });
        assert(loginSuccess.status === 200, "Returns HTTP 200 on valid credentials");
        assert(loginSuccess.data.success === true, "Response has success: true");
        assert(loginSuccess.data.user.email === testEmail.toLowerCase(), "User email matches");
        assert(!loginSuccess.data.user.password && !loginSuccess.data.user.passwordHash, "No password hash leaked during login");
        const userToken = loginSuccess.data.token;
        assert(Boolean(userToken), "Issues JWT token");

        // Test 7: Reject login with incorrect password (HTTP 401 with generic error)
        console.log("\nTest 7: Reject login with incorrect password (HTTP 401)");
        const loginWrongPass = await request({
            method: "POST",
            path: "/auth/login",
            port,
            body: { email: testEmail, password: "WrongPassword!999" }
        });
        assert(loginWrongPass.status === 401, "Returns HTTP 401 on incorrect password");
        assert(loginWrongPass.data.error === "Invalid email or password.", "Uses generic error message to prevent enumeration");

        // Test 8: Reject login for non-existent email (HTTP 401 with generic error)
        console.log("\nTest 8: Reject login with non-existent email (HTTP 401)");
        const loginNonExistent = await request({
            method: "POST",
            path: "/auth/login",
            port,
            body: { email: "completely.nonexistent.user@example.com", password: testPassword }
        });
        assert(loginNonExistent.status === 401, "Returns HTTP 401 on non-existent account");
        assert(loginNonExistent.data.error === "Invalid email or password.", "Returns exact same generic error message");

        // Test 9: Protected route access with valid Bearer token (GET /auth/me)
        console.log("\nTest 9: Access protected route GET /auth/me with valid token");
        const meWithToken = await request({
            method: "GET",
            path: "/auth/me",
            port,
            headers: { Authorization: `Bearer ${userToken}` }
        });
        assert(meWithToken.status === 200, "Returns HTTP 200 for authenticated user");
        assert(meWithToken.data.user.name === testName, "Returns authentic user profile name");
        assert(meWithToken.data.user.email === testEmail.toLowerCase(), "Returns user email");

        // Test 10: Reject protected route without token (HTTP 401)
        console.log("\nTest 10: Reject protected route access without token (HTTP 401)");
        const meNoToken = await request({
            method: "GET",
            path: "/auth/me",
            port
        });
        assert(meNoToken.status === 401, "Returns HTTP 401 when no token is provided");

        // Test 11: Reject protected route with forged/invalid token (HTTP 401)
        console.log("\nTest 11: Reject protected route with forged token (HTTP 401)");
        const meForgedToken = await request({
            method: "GET",
            path: "/auth/me",
            port,
            headers: { Authorization: "Bearer forged.invalid.token" }
        });
        assert(meForgedToken.status === 401, "Returns HTTP 401 on forged token");

        // Test 12: Logout route clears cookie (HTTP 200)
        console.log("\nTest 12: Logout clears authentication cookie");
        const logoutRes = await request({
            method: "POST",
            path: "/auth/logout",
            port
        });
        assert(logoutRes.status === 200, "Returns HTTP 200 on logout");
        const logoutCookies = logoutRes.headers["set-cookie"] || [];
        const logoutCookieStr = Array.isArray(logoutCookies) ? logoutCookies.join("; ") : logoutCookies;
        assert(logoutCookieStr.includes("token=;") || logoutCookieStr.includes("Expires="), "Cookie is cleared on logout");

        // Test 13: Verify guest checkout continues to work without authentication
        console.log("\nTest 13: Verify guest checkout remains operational (No Auth Required)");
        const guestOrder = await request({
            method: "POST",
            path: "/orders",
            port,
            body: {
                customer: {
                    name: "Guest Shopper",
                    email: "guest@example.com",
                    phone: "9876543210",
                    address: "100 Guest Way, Chennai"
                },
                items: [{ id: 1, quantity: 1 }]
            }
        });
        assert(guestOrder.status === 201, "Guest checkout succeeds with HTTP 201");
        assert(guestOrder.data.success === true, "Guest order confirms successfully");

        console.log("\n==========================================");
        console.log(`Auth Test Results: ${passedTests} PASSED, ${failedTests} FAILED`);
        console.log("==========================================");

        testServer.close();
        process.exit(failedTests === 0 ? 0 : 1);
    } catch (err) {
        console.error("Auth test execution error:", err);
        testServer.close();
        process.exit(1);
    }
}

runTests();
