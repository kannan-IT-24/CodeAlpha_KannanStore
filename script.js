"use strict";

// ==========================================
// KANNANSTORE - STATE & LOCALSTORAGE
// ==========================================

// Products will be fetched dynamically from the MongoDB Atlas backend API
let products = [];

const JWT_SECRET = process.env.JWT_SECRET?.trim();

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from environment variables.");
}
// Cart persistence using localStorage
// Each cart entry stores a product ID and its selected quantity
const savedCart = JSON.parse(
    localStorage.getItem("kannanStoreCart") || "[]"
);

const cart = new Map(savedCart);

function saveCart() {
    localStorage.setItem(
        "kannanStoreCart",
        JSON.stringify([...cart])
    );
}

// ==========================================
// DOM ELEMENTS
// ==========================================

const productGrid = document.getElementById("product-grid");
const productCount = document.getElementById("product-count");
const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");
const clearFiltersButton = document.getElementById("clear-filters");
const emptyClearButton = document.getElementById("empty-clear");
const emptyState = document.getElementById("empty-state");

// Feedback states
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");
const retryButton = document.getElementById("retry-button");

// Cart elements
const cartCountDisplay = document.getElementById("cart-count");
const cartItemsContainer = document.getElementById("cart-items");
const summaryCount = document.getElementById("summary-count");
const cartTotal = document.getElementById("cart-total");
const cartToggle = document.getElementById("cart-toggle");
const cartSection = document.getElementById("cart-section");
const checkoutButton = document.getElementById("checkout-button");
const statusMessage = document.getElementById("status-message");

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Format prices in Indian Rupees (₹)
function formatPrice(amount) {
    return amount.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    });
}

// Resilient product finder: matches numeric id or MongoDB _id (string or ObjectId)
function findProduct(productId) {
    return products.find(function(item) {
        return (
            item.id === productId ||
            item._id === productId ||
            String(item.id) === String(productId) ||
            String(item._id) === String(productId)
        );
    });
}

// Render product image or emoji placeholder
function renderProductImage(product) {
    const container = document.createElement("div");
    container.className = "product-image";
    container.setAttribute("aria-hidden", "true");

    const imageUrl = product.image || product.imageUrl;
    if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = product.name || "Product image";
        img.className = "product-img-element";
        img.loading = "lazy";
        img.onerror = function() {
            // Fallback to product icon or default emoji if image URL fails to load
            container.innerHTML = "";
            container.textContent = product.icon || "🛍️";
        };
        container.appendChild(img);
    } else if (product.icon) {
        container.textContent = product.icon;
    } else {
        // Suitable placeholder if no image URL or icon exists
        container.textContent = "🛍️";
    }

    return container;
}

// ==========================================
// DISPLAY PRODUCT CARDS
// ==========================================

function renderProducts() {
    if (!productGrid) return;

    const searchTerm = searchInput.value.trim().toLowerCase();
    const selectedCategory = categoryFilter.value;

    const filteredProducts = products.filter(function(product) {
        const nameMatch = (product.name || "").toLowerCase().includes(searchTerm);
        const descMatch = (product.description || "").toLowerCase().includes(searchTerm);
        const catMatch = (product.category || "").toLowerCase().includes(searchTerm);
        const matchesSearch = nameMatch || descMatch || catMatch;

        const matchesCategory =
            selectedCategory === "all" ||
            (product.category || "").toLowerCase() === selectedCategory.toLowerCase();

        return matchesSearch && matchesCategory;
    });

    productGrid.innerHTML = "";

    productCount.textContent =
        filteredProducts.length +
        (filteredProducts.length === 1
            ? " product found"
            : " products found");

    emptyState.hidden = filteredProducts.length !== 0;
    productGrid.hidden = filteredProducts.length === 0;

    filteredProducts.forEach(function(product) {
        const productId = product.id ?? product._id;

        const card = document.createElement("article");
        card.className = "product";

        const image = renderProductImage(product);

        const category = document.createElement("span");
        category.className = "product-category";
        category.textContent = product.category || "General";

        const name = document.createElement("h3");
        name.textContent = product.name;

        const description = document.createElement("p");
        description.className = "product-description";
        description.textContent = product.description || "Quality pick for your everyday life.";

        const bottom = document.createElement("div");
        bottom.className = "product-bottom";

        const price = document.createElement("span");
        price.className = "product-price";
        price.textContent = formatPrice(Number(product.price) || 0);

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "add-button";
        addButton.textContent = "Add to Cart";
        addButton.setAttribute(
            "aria-label",
            "Add " + product.name + " to cart"
        );

        addButton.addEventListener("click", function() {
            addToCart(productId);
        });

        bottom.append(price, addButton);
        card.append(image, category, name, description, bottom);
        productGrid.appendChild(card);
    });
}

// ==========================================
// ADD PRODUCTS TO CART
// ==========================================

function addToCart(productId) {
    const product = findProduct(productId);

    if (!product) {
        return;
    }

    const currentQuantity = cart.get(productId) || 0;
    cart.set(productId, currentQuantity + 1);

    saveCart();
    renderCart();

    if (statusMessage) {
        statusMessage.textContent = product.name + " added to cart.";
    }
}

// ==========================================
// CHANGE PRODUCT QUANTITY
// ==========================================

function changeQuantity(productId, change) {
    const currentQuantity = cart.get(productId) || 0;
    const newQuantity = currentQuantity + change;

    if (newQuantity <= 0) {
        cart.delete(productId);
    } else {
        cart.set(productId, newQuantity);
    }

    saveCart();
    renderCart();
}

// ==========================================
// REMOVE A PRODUCT
// ==========================================

function removeFromCart(productId) {
    const product = findProduct(productId);

    cart.delete(productId);
    saveCart();
    renderCart();

    if (product && statusMessage) {
        statusMessage.textContent = product.name + " removed from cart.";
    }
}

// ==========================================
// DISPLAY CART AND TOTAL
// ==========================================

function renderCart() {
    if (!cartItemsContainer) return;

    cartItemsContainer.innerHTML = "";

    let totalItems = 0;
    let totalAmount = 0;

    cart.forEach(function(quantity, productId) {
        const product = findProduct(productId);

        if (!product) {
            return;
        }

        const unitPrice = Number(product.price) || 0;
        totalItems += quantity;
        totalAmount += unitPrice * quantity;

        const item = document.createElement("article");
        item.className = "cart-item";

        const icon = document.createElement("div");
        icon.className = "cart-item-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = product.icon || "🛍️";

        const details = document.createElement("div");

        const name = document.createElement("h3");
        name.textContent = product.name;

        const price = document.createElement("p");
        price.className = "cart-item-price";
        price.textContent = formatPrice(unitPrice * quantity);

        const quantityControls = document.createElement("div");
        quantityControls.className = "quantity-controls";

        const decreaseButton = document.createElement("button");
        decreaseButton.type = "button";
        decreaseButton.textContent = "−";
        decreaseButton.setAttribute(
            "aria-label",
            "Decrease quantity of " + product.name
        );

        decreaseButton.addEventListener("click", function() {
            changeQuantity(productId, -1);
        });

        const quantityValue = document.createElement("span");
        quantityValue.className = "quantity-value";
        quantityValue.textContent = quantity;

        const increaseButton = document.createElement("button");
        increaseButton.type = "button";
        increaseButton.textContent = "+";
        increaseButton.setAttribute(
            "aria-label",
            "Increase quantity of " + product.name
        );

        increaseButton.addEventListener("click", function() {
            changeQuantity(productId, 1);
        });

        quantityControls.append(
            decreaseButton,
            quantityValue,
            increaseButton
        );

        details.append(name, price, quantityControls);

        const actions = document.createElement("div");
        actions.className = "cart-item-actions";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-button";
        removeButton.textContent = "Remove";

        removeButton.addEventListener("click", function() {
            removeFromCart(productId);
        });

        actions.appendChild(removeButton);
        item.append(icon, details, actions);
        cartItemsContainer.appendChild(item);
    });

    if (totalItems === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "cart-empty";
        emptyMessage.textContent = "Your cart is empty. 💜";
        cartItemsContainer.appendChild(emptyMessage);
    }

    if (cartCountDisplay) cartCountDisplay.textContent = totalItems;
    if (summaryCount) summaryCount.textContent = totalItems;
    if (cartTotal) cartTotal.textContent = formatPrice(totalAmount);
    if (checkoutButton) checkoutButton.disabled = totalItems === 0;
}

// ==========================================
// FETCH PRODUCTS FROM BACKEND API
// ==========================================

const isSameOriginBackend =
    typeof window !== "undefined" &&
    window.location.protocol.startsWith("http") &&
    (window.location.port === "3000" || window.location.origin.includes(":3000"));

const API_BASE_URL = isSameOriginBackend
    ? window.location.origin
    : "http://localhost:3000";

const API_URL = `${API_BASE_URL}/products`;

// Request with timeout (15 seconds default) using AbortController
const responseTimeouts = new WeakMap();

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        responseTimeouts.set(response, timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
            throw new Error("Request timed out. Please check your network connection and try again.");
        }
        if (err instanceof TypeError && err.message && err.message.toLowerCase().includes("fetch")) {
            throw new Error("Unable to connect to the server. Please verify the KannanStore backend is running.");
        }
        throw err;
    }
}

// Safely parse JSON from server responses without crashing on unexpected formats
async function safeParseJson(response) {
    try {
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    } catch (err) {
        if (err.name === "AbortError") {
            throw new Error("Request timed out. Please check your network connection and try again.");
        }
        return {};
    } finally {
        const timeoutId = responseTimeouts.get(response);
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            responseTimeouts.delete(response);
        }
    }
}

async function fetchProducts() {
    // Show loading state, hide errors and grid
    if (loadingState) loadingState.hidden = false;
    if (errorState) errorState.hidden = true;
    if (emptyState) emptyState.hidden = true;
    if (productGrid) productGrid.hidden = true;
    if (productCount) productCount.textContent = "Connecting to database...";

    try {
        // fetch(API_URL) with timeout protection
        const response = await fetchWithTimeout(API_URL, {}, 15000);

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status} (${response.statusText || "Error"})`);
        }

        const data = await safeParseJson(response);

        if (!Array.isArray(data)) {
            throw new Error("Invalid response: expected an array of products from the database.");
        }

        // Store products received from MongoDB Atlas
        products = data;

        // Hide loading state and display the product grid
        if (loadingState) loadingState.hidden = true;
        if (errorState) errorState.hidden = true;
        if (productGrid) productGrid.hidden = false;

        // Render products from MongoDB and synchronize cart with product details
        renderProducts();
        renderCart();

    } catch (error) {
        console.error("Failed to load products from MongoDB API:", error);

        if (loadingState) loadingState.hidden = true;
        if (productGrid) productGrid.hidden = true;
        if (emptyState) emptyState.hidden = true;

        if (errorState) {
            errorState.hidden = false;
            if (errorMessage) {
                errorMessage.textContent =
                    "Could not connect to KannanStore backend at http://localhost:3000 (" +
                    error.message +
                    "). Make sure the backend server is running.";
            }
        }

        if (productCount) {
            productCount.textContent = "0 products available";
        }
    }
}

// ==========================================
// SEARCH AND FILTER EVENTS
// ==========================================

if (searchInput) {
    searchInput.addEventListener("input", renderProducts);
}

if (categoryFilter) {
    categoryFilter.addEventListener("change", renderProducts);
}

function clearFilters() {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    renderProducts();
}

if (clearFiltersButton) {
    clearFiltersButton.addEventListener("click", clearFilters);
}

if (emptyClearButton) {
    emptyClearButton.addEventListener("click", clearFilters);
}

if (retryButton) {
    retryButton.addEventListener("click", fetchProducts);
}

// ==========================================
// CART NAVIGATION
// ==========================================

if (cartToggle && cartSection) {
    cartToggle.addEventListener("click", function() {
        cartSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
}

// ==========================================
// CHECKOUT & ORDER PLACEMENT
// ==========================================

const checkoutModal = document.getElementById("checkout-modal");
const closeCheckoutModalBtn = document.getElementById("close-checkout-modal");
const cancelCheckoutBtn = document.getElementById("cancel-checkout-button");
const checkoutForm = document.getElementById("checkout-form");
const checkoutFormContainer = document.getElementById("checkout-form-container");
const checkoutSuccessContainer = document.getElementById("checkout-success-container");
const checkoutError = document.getElementById("checkout-error");
const placeOrderBtn = document.getElementById("place-order-button");
const placeOrderText = document.getElementById("place-order-text");
const placeOrderSpinner = document.getElementById("place-order-spinner");
const continueShoppingBtn = document.getElementById("continue-shopping-button");

// Modal order summary elements
const modalOrderItemsCount = document.getElementById("modal-order-items-count");
const modalOrderTotal = document.getElementById("modal-order-total");

// Success view elements
const successOrderId = document.getElementById("success-order-id");
const successCustomerName = document.getElementById("success-customer-name");
const successOrderTotal = document.getElementById("success-order-total");
const successItemsList = document.getElementById("success-items-list");

const ORDERS_API_URL = `${API_BASE_URL}/orders`;

function openCheckoutModal() {
    if (cart.size === 0) {
        if (statusMessage) statusMessage.textContent = "Your cart is empty.";
        return;
    }

    // Calculate item count and estimated total for modal preview
    let count = 0;
    let estTotal = 0;
    cart.forEach(function(quantity, productId) {
        const prod = findProduct(productId);
        count += quantity;
        if (prod) {
            estTotal += (Number(prod.price) || 0) * quantity;
        }
    });

    if (modalOrderItemsCount) modalOrderItemsCount.textContent = count;
    if (modalOrderTotal) modalOrderTotal.textContent = formatPrice(estTotal);

    // Reset view states
    if (checkoutFormContainer) checkoutFormContainer.hidden = false;
    if (checkoutSuccessContainer) checkoutSuccessContainer.hidden = true;
    if (checkoutError) {
        checkoutError.hidden = true;
        checkoutError.textContent = "";
    }

    if (checkoutModal) {
        checkoutModal.classList.add("active");
        checkoutModal.setAttribute("aria-hidden", "false");
    }

    // Prefill customer details if user is logged in
    const nameInput = document.getElementById("customer-name");
    const emailInput = document.getElementById("customer-email");
    if (currentUser) {
        if (nameInput && !nameInput.value) nameInput.value = currentUser.name;
        if (emailInput && !emailInput.value) emailInput.value = currentUser.email;
    }

    // Focus first empty or relevant input field
    if (nameInput) {
        setTimeout(function() {
            if (currentUser && emailInput) {
                const phoneInput = document.getElementById("customer-phone");
                if (phoneInput) phoneInput.focus();
            } else {
                nameInput.focus();
            }
        }, 100);
    }
}

function closeCheckoutModal() {
    if (checkoutModal) {
        checkoutModal.classList.remove("active");
        checkoutModal.setAttribute("aria-hidden", "true");
    }
}

// Open modal when user clicks 'Proceed to Checkout'
if (checkoutButton) {
    checkoutButton.addEventListener("click", openCheckoutModal);
}

// Close buttons
if (closeCheckoutModalBtn) {
    closeCheckoutModalBtn.addEventListener("click", closeCheckoutModal);
}

if (cancelCheckoutBtn) {
    cancelCheckoutBtn.addEventListener("click", closeCheckoutModal);
}

// Close when clicking outside modal card on backdrop
if (checkoutModal) {
    checkoutModal.addEventListener("click", function(event) {
        if (event.target === checkoutModal) {
            closeCheckoutModal();
        }
    });
}

// Continue Shopping button in success screen
if (continueShoppingBtn) {
    continueShoppingBtn.addEventListener("click", function() {
        closeCheckoutModal();
        const productsSection = document.getElementById("products");
        if (productsSection) {
            productsSection.scrollIntoView({ behavior: "smooth" });
        }
    });
}

// Handle Order Form Submission
if (checkoutForm) {
    checkoutForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        // Hide previous errors
        if (checkoutError) {
            checkoutError.hidden = true;
            checkoutError.textContent = "";
        }

        const nameInput = document.getElementById("customer-name");
        const emailInput = document.getElementById("customer-email");
        const phoneInput = document.getElementById("customer-phone");
        const addressInput = document.getElementById("customer-address");

        const name = nameInput ? nameInput.value.trim() : "";
        const email = emailInput ? emailInput.value.trim() : "";
        const phone = phoneInput ? phoneInput.value.trim() : "";
        const address = addressInput ? addressInput.value.trim() : "";

        // Client-side validations
        if (!name || name.length < 2) {
            showCheckoutError("Please enter your full name (at least 2 characters).");
            if (nameInput) nameInput.focus();
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            showCheckoutError("Please enter a valid email address.");
            if (emailInput) emailInput.focus();
            return;
        }

        if (!phone || phone.length < 7) {
            showCheckoutError("Please enter a valid contact phone number (at least 7 digits).");
            if (phoneInput) phoneInput.focus();
            return;
        }

        if (!address || address.length < 5) {
            showCheckoutError("Please enter a complete delivery address.");
            if (addressInput) addressInput.focus();
            return;
        }

        if (cart.size === 0) {
            showCheckoutError("Your cart is empty. Please add items to your cart first.");
            return;
        }

        // Prepare order items: ONLY send product identifier and quantity
        // The server will verify prices directly against MongoDB Atlas
        const orderItems = [];
        cart.forEach(function(quantity, productId) {
            orderItems.push({
                productId: productId,
                quantity: quantity
            });
        });

        const orderPayload = {
            customer: {
                name: name,
                email: email,
                phone: phone,
                address: address
            },
            items: orderItems
        };

        // Set button loading state
        setSubmittingState(true);

        try {
            const credentialsMode = isSameOriginBackend ? "same-origin" : "include";
            const response = await fetchWithTimeout(ORDERS_API_URL, {
                method: "POST",
                credentials: credentialsMode,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(orderPayload)
            }, 15000);

            const data = await safeParseJson(response);

            if (!response.ok) {
                throw new Error(data.error || `Server responded with status ${response.status}`);
            }

            // ORDER CONFIRMED BY MONGODB:
            // 1. Show confirmation view
            if (checkoutFormContainer) checkoutFormContainer.hidden = true;
            if (checkoutSuccessContainer) checkoutSuccessContainer.hidden = false;

            if (successOrderId) {
                successOrderId.textContent = "#" + (data.orderId || data.order?.id || "CONFIRMED");
            }
            if (successCustomerName) {
                successCustomerName.textContent = data.order?.customer?.name || name;
            }
            if (successOrderTotal) {
                successOrderTotal.textContent = formatPrice(data.order?.total || 0);
            }

            // Render confirmed items
            if (successItemsList && Array.isArray(data.order?.items)) {
                successItemsList.innerHTML = "";
                data.order.items.forEach(function(item) {
                    const row = document.createElement("div");
                    row.className = "success-item-row";

                    const left = document.createElement("span");
                    const qtySpan = document.createElement("span");
                    qtySpan.className = "item-qty";
                    qtySpan.textContent = item.quantity + "×";
                    left.append(qtySpan, " " + item.name);

                    const price = document.createElement("strong");
                    price.textContent = formatPrice(item.itemTotal || 0);

                    row.append(left, price);
                    successItemsList.appendChild(row);
                });
            }

            // 2. Clear cart ONLY after verified MongoDB persistence
            cart.clear();
            saveCart();
            renderCart();

            // Reset form fields
            checkoutForm.reset();

            if (statusMessage) {
                statusMessage.textContent = "Order placed successfully! Order ID: " + data.orderId;
            }

        } catch (error) {
            console.error("Order placement failed:", error);
            showCheckoutError(error.message || "Failed to place your order. Please check your connection and try again.");
        } finally {
            setSubmittingState(false);
        }
    });
}

function showCheckoutError(message) {
    if (checkoutError) {
        checkoutError.hidden = false;
        checkoutError.textContent = message;
    }
}

function setSubmittingState(isSubmitting) {
    if (placeOrderBtn) placeOrderBtn.disabled = isSubmitting;
    if (placeOrderText) placeOrderText.textContent = isSubmitting ? "Placing Order..." : "Confirm & Place Order";
    if (placeOrderSpinner) placeOrderSpinner.hidden = !isSubmitting;
}

// ==========================================
// USER AUTHENTICATION CONTROLLER
// ==========================================

let currentUser = null;

const authModal = document.getElementById("auth-modal");
const openAuthBtn = document.getElementById("open-auth-btn");
const closeAuthModalBtn = document.getElementById("close-auth-modal");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginFormView = document.getElementById("login-form-view");
const registerFormView = document.getElementById("register-form-view");

const userProfileBadge = document.getElementById("user-profile-badge");
const navUserGreeting = document.getElementById("nav-user-greeting");
const logoutBtn = document.getElementById("logout-btn");

const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginSubmitBtn = document.getElementById("login-submit-btn");
const loginBtnText = document.getElementById("login-btn-text");
const loginBtnSpinner = document.getElementById("login-btn-spinner");

const registerForm = document.getElementById("register-form");
const registerNameInput = document.getElementById("register-name");
const registerEmailInput = document.getElementById("register-email");
const registerPasswordInput = document.getElementById("register-password");
const registerConfirmPasswordInput = document.getElementById("register-confirm-password");
const registerError = document.getElementById("register-error");
const registerSubmitBtn = document.getElementById("register-submit-btn");
const registerBtnText = document.getElementById("register-btn-text");
const registerBtnSpinner = document.getElementById("register-btn-spinner");

const switchToRegister = document.getElementById("switch-to-register");
const switchToLogin = document.getElementById("switch-to-login");

// Password toggle elements
const toggleLoginPasswordBtn = document.getElementById("toggle-login-password");
const toggleRegisterPasswordBtn = document.getElementById("toggle-register-password");
const toggleRegisterConfirmPasswordBtn = document.getElementById("toggle-register-confirm-password");

const AUTH_API_BASE = `${API_BASE_URL}/auth`;

// Concurrency guard to prevent duplicate submissions
let isAuthSubmitting = false;

// ==========================================
// PASSWORD SHOW / HIDE TOGGLE
// ==========================================

function setupPasswordToggle(button, input) {
    if (!button || !input) return;

    button.addEventListener("click", function() {
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";

        const newLabel = isPassword ? "Hide password" : "Show password";
        button.setAttribute("aria-label", newLabel);
        button.setAttribute("aria-pressed", isPassword ? "true" : "false");
        button.setAttribute("title", newLabel);

        const iconSpan = button.querySelector(".eye-icon");
        if (iconSpan) {
            iconSpan.textContent = isPassword ? "🙈" : "👁️";
        }
    });
}

// Initialize show/hide toggles for all password fields
setupPasswordToggle(toggleLoginPasswordBtn, loginPasswordInput);
setupPasswordToggle(toggleRegisterPasswordBtn, registerPasswordInput);
setupPasswordToggle(toggleRegisterConfirmPasswordBtn, registerConfirmPasswordInput);

function resetPasswordToggles() {
    const toggleConfigs = [
        { btn: toggleLoginPasswordBtn, input: loginPasswordInput },
        { btn: toggleRegisterPasswordBtn, input: registerPasswordInput },
        { btn: toggleRegisterConfirmPasswordBtn, input: registerConfirmPasswordInput }
    ];

    toggleConfigs.forEach(function({ btn, input }) {
        if (input) input.type = "password";
        if (btn) {
            btn.setAttribute("aria-label", "Show password");
            btn.setAttribute("aria-pressed", "false");
            btn.setAttribute("title", "Show password");
            const iconSpan = btn.querySelector(".eye-icon");
            if (iconSpan) iconSpan.textContent = "👁️";
        }
    });
}

function setLoginSubmitting(isSubmitting) {
    if (loginSubmitBtn) loginSubmitBtn.disabled = isSubmitting;
    if (loginBtnText) loginBtnText.textContent = isSubmitting ? "Signing In..." : "Sign In →";
    if (loginBtnSpinner) loginBtnSpinner.hidden = !isSubmitting;
}

function setRegisterSubmitting(isSubmitting) {
    if (registerSubmitBtn) registerSubmitBtn.disabled = isSubmitting;
    if (registerBtnText) registerBtnText.textContent = isSubmitting ? "Creating Account..." : "Create Account →";
    if (registerBtnSpinner) registerBtnSpinner.hidden = !isSubmitting;
}

function setAuthMode(mode) {
    if (isAuthSubmitting) return;

    resetPasswordToggles();

    if (mode === "register") {
        if (tabRegister) {
            tabRegister.classList.add("active");
            tabRegister.setAttribute("aria-selected", "true");
        }
        if (tabLogin) {
            tabLogin.classList.remove("active");
            tabLogin.setAttribute("aria-selected", "false");
        }
        if (registerFormView) registerFormView.hidden = false;
        if (loginFormView) loginFormView.hidden = true;
        if (registerError) {
            registerError.hidden = true;
            registerError.textContent = "";
        }
        if (registerNameInput) setTimeout(() => registerNameInput.focus(), 100);
    } else {
        if (tabLogin) {
            tabLogin.classList.add("active");
            tabLogin.setAttribute("aria-selected", "true");
        }
        if (tabRegister) {
            tabRegister.classList.remove("active");
            tabRegister.setAttribute("aria-selected", "false");
        }
        if (loginFormView) loginFormView.hidden = false;
        if (registerFormView) registerFormView.hidden = true;
        if (loginError) {
            loginError.hidden = true;
            loginError.textContent = "";
        }
        if (loginEmailInput) setTimeout(() => loginEmailInput.focus(), 100);
    }
}

function openAuthModal(initialMode = "login") {
    setAuthMode(initialMode);
    if (authModal) {
        authModal.classList.add("active");
        authModal.setAttribute("aria-hidden", "false");
    }
}

function closeAuthModal() {
    resetPasswordToggles();

    if (authModal) {
        authModal.classList.remove("active");
        authModal.setAttribute("aria-hidden", "true");
    }
}

function updateAuthUI(user) {
    currentUser = user;
    if (user) {
        if (openAuthBtn) openAuthBtn.hidden = true;
        if (userProfileBadge) userProfileBadge.hidden = false;
        if (navUserGreeting) {
            const firstName = (user.name || "User").split(" ")[0];
            navUserGreeting.textContent = "Hi, " + firstName;
        }
    } else {
        if (openAuthBtn) openAuthBtn.hidden = false;
        if (userProfileBadge) userProfileBadge.hidden = true;
    }
}

// Check session on page load using secure HttpOnly cookie
async function checkAuthStatus() {
    try {
        const credentialsMode = isSameOriginBackend ? "same-origin" : "include";
        const response = await fetchWithTimeout(`${AUTH_API_BASE}/me`, {
            credentials: credentialsMode
        }, 10000);

        if (response.ok) {
            const data = await safeParseJson(response);
            if (data.user) {
                updateAuthUI(data.user);
            }
        } else {
            updateAuthUI(null);
        }
    } catch {
        updateAuthUI(null);
    }
}

if (openAuthBtn) {
    openAuthBtn.addEventListener("click", () => openAuthModal("login"));
}

if (closeAuthModalBtn) {
    closeAuthModalBtn.addEventListener("click", closeAuthModal);
}

if (authModal) {
    authModal.addEventListener("click", (e) => {
        if (e.target === authModal) closeAuthModal();
    });
}

if (tabLogin) {
    tabLogin.addEventListener("click", () => setAuthMode("login"));
}

if (tabRegister) {
    tabRegister.addEventListener("click", () => setAuthMode("register"));
}

if (switchToRegister) {
    switchToRegister.addEventListener("click", () => setAuthMode("register"));
}

if (switchToLogin) {
    switchToLogin.addEventListener("click", () => setAuthMode("login"));
}

// Handle Login Form Submit
if (loginForm) {
    loginForm.addEventListener("submit", async function(e) {
        e.preventDefault();

        // Prevent accidental duplicate submissions
        if (isAuthSubmitting) return;

        if (loginError) {
            loginError.hidden = true;
            loginError.textContent = "";
        }

        const email = loginEmailInput ? loginEmailInput.value.trim() : "";
        const password = loginPasswordInput ? loginPasswordInput.value : "";

        if (!email || !password) {
            if (loginError) {
                loginError.hidden = false;
                loginError.textContent = "Please enter both email address and password.";
            }
            return;
        }

        isAuthSubmitting = true;
        setLoginSubmitting(true);

        try {
            const credentialsMode = isSameOriginBackend ? "same-origin" : "include";
            const response = await fetchWithTimeout(`${AUTH_API_BASE}/login`, {
                method: "POST",
                credentials: credentialsMode,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            }, 15000);

            const data = await safeParseJson(response);

            if (!response.ok) {
                throw new Error(data.error || (response.status === 401 ? "Invalid email or password." : `Server responded with status ${response.status}`));
            }

            if (!data.user) {
                throw new Error("Unexpected server response format. Please try again.");
            }

            // Successfully authenticated
            updateAuthUI(data.user);
            loginForm.reset();
            resetPasswordToggles();
            closeAuthModal();

            if (statusMessage) {
                statusMessage.textContent = "Logged in successfully. Welcome back, " + data.user.name + "!";
            }
        } catch (err) {
            if (loginError) {
                loginError.hidden = false;
                loginError.textContent = err.message || "Invalid email or password.";
            }
        } finally {
            setLoginSubmitting(false);
            isAuthSubmitting = false;
        }
    });
}

// Handle Register Form Submit
if (registerForm) {
    registerForm.addEventListener("submit", async function(e) {
        e.preventDefault();

        // Prevent accidental duplicate submissions
        if (isAuthSubmitting) return;

        if (registerError) {
            registerError.hidden = true;
            registerError.textContent = "";
        }

        const name = registerNameInput ? registerNameInput.value.trim() : "";
        const email = registerEmailInput ? registerEmailInput.value.trim() : "";
        const password = registerPasswordInput ? registerPasswordInput.value : "";
        const confirmPassword = registerConfirmPasswordInput ? registerConfirmPasswordInput.value : "";

        if (!name || name.length < 2) {
            if (registerError) {
                registerError.hidden = false;
                registerError.textContent = "Please enter your full name (at least 2 characters).";
            }
            if (registerNameInput) registerNameInput.focus();
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            if (registerError) {
                registerError.hidden = false;
                registerError.textContent = "Please enter a valid email address.";
            }
            if (registerEmailInput) registerEmailInput.focus();
            return;
        }

        if (!password || password.length < 6) {
            if (registerError) {
                registerError.hidden = false;
                registerError.textContent = "Password must be at least 6 characters long.";
            }
            if (registerPasswordInput) registerPasswordInput.focus();
            return;
        }

        if (password !== confirmPassword) {
            if (registerError) {
                registerError.hidden = false;
                registerError.textContent = "Passwords do not match. Please re-enter.";
            }
            if (registerConfirmPasswordInput) registerConfirmPasswordInput.focus();
            return;
        }

        isAuthSubmitting = true;
        setRegisterSubmitting(true);

        try {
            const credentialsMode = isSameOriginBackend ? "same-origin" : "include";
            const response = await fetchWithTimeout(`${AUTH_API_BASE}/register`, {
                method: "POST",
                credentials: credentialsMode,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password })
            }, 15000);

            const data = await safeParseJson(response);

            if (!response.ok) {
                throw new Error(data.error || `Registration failed with status ${response.status}.`);
            }

            if (!data.user) {
                throw new Error("Unexpected server response format. Please try again.");
            }

            // Successfully registered and logged in
            updateAuthUI(data.user);
            registerForm.reset();
            resetPasswordToggles();
            closeAuthModal();

            if (statusMessage) {
                statusMessage.textContent = "Account registered successfully! Welcome to KannanStore, " + data.user.name + "!";
            }
        } catch (err) {
            if (registerError) {
                registerError.hidden = false;
                registerError.textContent = err.message || "Registration failed. Please try again.";
            }
        } finally {
            setRegisterSubmitting(false);
            isAuthSubmitting = false;
        }
    });
}

// Handle Logout
if (logoutBtn) {
    logoutBtn.addEventListener("click", async function() {
        try {
            const credentialsMode = isSameOriginBackend ? "same-origin" : "include";
            const response = await fetchWithTimeout(`${AUTH_API_BASE}/logout`, {
                method: "POST",
                credentials: credentialsMode
            }, 8000);
            await safeParseJson(response);
        } catch (err) {
            console.error("Logout request error:", err);
        }
        updateAuthUI(null);
        if (statusMessage) {
            statusMessage.textContent = "You have signed out.";
        }
    });
}

// ==========================================
// START THE STORE
// ==========================================

// Initial cart badge update before network response arrives
let initialCartCount = 0;
cart.forEach(function(qty) { initialCartCount += qty; });
if (cartCountDisplay) cartCountDisplay.textContent = initialCartCount;

// Fetch products & verify session
fetchProducts();
checkAuthStatus();
