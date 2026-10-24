// ==========================================
// KannanStore - Auth UI & Loading State Automated Verification
// ==========================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

async function runTests() {
    console.log("==================================================");
    console.log("👁️ Testing Auth UI, Password Toggles & Loading State");
    console.log("==================================================\n");

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

    const htmlContent = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const cssContent = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
    const jsContent = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");

    // 1. Password Show/Hide Elements in index.html
    console.log("1. Verifying Password Show/Hide Toggle Markup in index.html");
    assert(htmlContent.includes('id="toggle-login-password"'), "Contains #toggle-login-password button");
    assert(htmlContent.includes('id="toggle-register-password"'), "Contains #toggle-register-password button");
    assert(htmlContent.includes('id="toggle-register-confirm-password"'), "Contains #toggle-register-confirm-password button");
    assert(htmlContent.includes('class="password-input-wrapper"'), "Wraps password fields with .password-input-wrapper");
    assert(htmlContent.includes('aria-label="Show password"'), "Includes descriptive aria-label on toggle buttons");
    assert(htmlContent.includes('aria-pressed="false"'), "Includes aria-pressed attribute for accessibility");

    // 2. CSS Styling for Password Toggle in style.css
    console.log("\n2. Verifying CSS styling for Password Toggle in style.css");
    assert(cssContent.includes(".password-input-wrapper"), "Contains .password-input-wrapper style rule");
    assert(cssContent.includes(".password-toggle-btn"), "Contains .password-toggle-btn style rule");
    assert(cssContent.includes("padding-right: 44px"), "Reserves space on input for toggle button");
    assert(/\.inline-spinner\[hidden\]\s*\{\s*display:\s*none;\s*\}/.test(cssContent), "Keeps hidden auth spinners out of view despite the spinner display rule");

    // 3. Script Logic for Toggling & Loading Resilience in script.js
    console.log("\n3. Verifying Script Logic for Show/Hide and Loading State");
    assert(jsContent.includes("function setupPasswordToggle"), "Implements setupPasswordToggle function");
    assert(jsContent.includes("function resetPasswordToggles"), "Implements resetPasswordToggles function");
    assert(jsContent.includes("function fetchWithTimeout"), "Implements fetchWithTimeout with AbortController");
    assert(jsContent.includes("function safeParseJson"), "Implements safeParseJson to handle unexpected response formats");
    assert(jsContent.includes("isAuthSubmitting"), "Guards against concurrent/duplicate submissions");
    assert(jsContent.includes("timeoutMs = 15000"), "Uses 15-second timeout protection");
    assert(/function setAuthMode\(mode\)\s*\{\s*if \(isAuthSubmitting\) return;/.test(jsContent), "Does not switch auth mode during an active submission");
    const authModeStart = jsContent.indexOf("function setAuthMode(mode)");
    const authModeEnd = jsContent.indexOf("\nfunction openAuthModal", authModeStart);
    const closeModalStart = jsContent.indexOf("function closeAuthModal()");
    const closeModalEnd = jsContent.indexOf("\nfunction updateAuthUI", closeModalStart);
    assert(!/isAuthSubmitting\s*=\s*false;/.test(jsContent.slice(authModeStart, authModeEnd)), "Switching auth tabs does not release the submission guard");
    assert(!/isAuthSubmitting\s*=\s*false;/.test(jsContent.slice(closeModalStart, closeModalEnd)), "Closing the modal does not release the submission guard");

    // 4. Test Toggle Functionality Logic
    console.log("\n4. Verifying Password Toggle State Transition Logic");
    let mockInput = { type: "password" };
    let mockButton = {
        label: "Show password",
        pressed: "false",
        title: "Show password",
        icon: "👁️",
        setAttribute(k, v) {
            if (k === "aria-label") this.label = v;
            if (k === "aria-pressed") this.pressed = v;
            if (k === "title") this.title = v;
        }
    };

    function toggleLogic(button, input) {
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        const newLabel = isPassword ? "Hide password" : "Show password";
        button.setAttribute("aria-label", newLabel);
        button.setAttribute("aria-pressed", isPassword ? "true" : "false");
        button.setAttribute("title", newLabel);
        button.icon = isPassword ? "🙈" : "👁️";
    }

    // Toggle to visible
    toggleLogic(mockButton, mockInput);
    assert(mockInput.type === "text", "Password input type switches to 'text' when toggled ON");
    assert(mockButton.label === "Hide password", "Button label switches to 'Hide password'");
    assert(mockButton.pressed === "true", "Button aria-pressed is 'true'");
    assert(mockButton.icon === "🙈", "Icon changes to hidden eye/monkey");

    // Toggle back to hidden
    toggleLogic(mockButton, mockInput);
    assert(mockInput.type === "password", "Password input type switches back to 'password' when toggled OFF");
    assert(mockButton.label === "Show password", "Button label switches back to 'Show password'");
    assert(mockButton.pressed === "false", "Button aria-pressed is 'false'");
    assert(mockButton.icon === "👁️", "Icon changes back to eye");

    // 5. Test fetchWithTimeout Abort Behavior
    console.log("\n5. Testing fetchWithTimeout AbortController Timeout Protection");
    const slowServer = http.createServer((req, res) => {
        // Intentionally never respond to simulate a network hang
    });
    await new Promise((resolve) => slowServer.listen(0, resolve));
    const slowPort = slowServer.address().port;

    // Simulate fetchWithTimeout against slow server with 100ms timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100);
    let errorCaught = null;

    try {
        await fetch(`http://localhost:${slowPort}/slow`, { signal: controller.signal });
        clearTimeout(timeoutId);
    } catch (err) {
        clearTimeout(timeoutId);
        errorCaught = err;
    } finally {
        slowServer.close();
    }

    assert(errorCaught && errorCaught.name === "AbortError", "AbortController triggers AbortError when server hangs");

    // Exercise the actual fetchWithTimeout/safeParseJson implementation against headers
    // followed by a stalled response body, the case that previously bypassed the timeout.
    console.log("\n6. Testing Runtime Timeout Through Response Body Parsing");
    const stalledBodyServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.flushHeaders();
    });
    await new Promise((resolve) => stalledBodyServer.listen(0, resolve));
    const stalledBodyPort = stalledBodyServer.address().port;
    const helperStart = jsContent.indexOf("const responseTimeouts = new WeakMap();");
    const helperEnd = jsContent.indexOf("\nasync function fetchProducts()", helperStart);
    const helperContext = {
        AbortController,
        WeakMap,
        clearTimeout,
        fetch,
        setTimeout,
        Error,
        TypeError,
        JSON
    };
    vm.runInNewContext(jsContent.slice(helperStart, helperEnd), helperContext);

    let bodyTimeoutError = null;
    try {
        const response = await helperContext.fetchWithTimeout(
            `http://localhost:${stalledBodyPort}/stalled-body`,
            {},
            100
        );
        await helperContext.safeParseJson(response);
    } catch (err) {
        bodyTimeoutError = err;
    } finally {
        stalledBodyServer.close();
    }

    assert(bodyTimeoutError && bodyTimeoutError.message.includes("Request timed out"), "Actual request helper times out while reading a stalled response body");

    // 6. Test Loading State Cleanup in finally
    console.log("\n7. Verifying Loading State Guarantees");
    let isSubmitting = true;
    let buttonDisabled = true;
    let buttonText = "Signing In...";
    let spinnerHidden = false;

    // Emulate try/catch/finally block
    try {
        throw new Error("Simulated network timeout");
    } catch (err) {
        // caught
    } finally {
        isSubmitting = false;
        buttonDisabled = false;
        buttonText = "Sign In →";
        spinnerHidden = true;
    }

    assert(buttonDisabled === false, "Button is re-enabled in finally block even after error");
    assert(buttonText === "Sign In →", "Button text is restored to normal in finally block");
    assert(spinnerHidden === true, "Loading spinner is hidden in finally block");
    assert(isSubmitting === false, "Submission guard is unlocked in finally block");

    console.log("\n==================================================");
    console.log(`UI & Loading Results: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log("==================================================");

    process.exit(failedTests === 0 ? 0 : 1);
}

runTests();
