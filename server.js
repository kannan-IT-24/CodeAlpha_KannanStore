require("dotenv").config();

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const JWT_SECRET = process.env.JWT_SECRET?.trim();

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required and must not be empty.");
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// Enable CORS so the frontend can fetch from the backend smoothly from any origin with credentials support
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
    } else {
        res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// Serve frontend static files (index.html, style.css, script.js) directly through Express
app.use(express.static(__dirname));

// Initial sample products to seed into MongoDB Atlas
const initialProducts = [
    {
        id: 1,
        name: "Wireless Headphones",
        price: 1499,
        category: "electronics",
        icon: "🎧",
        description: "Enjoy your favourite music with wireless freedom."
    },
    {
        id: 2,
        name: "Running Shoes",
        price: 2499,
        category: "fashion",
        icon: "👟",
        description: "Comfortable shoes for your everyday adventures."
    },
    {
        id: 3,
        name: "Travel Backpack",
        price: 999,
        category: "accessories",
        icon: "🎒",
        description: "Carry your essentials wherever you go."
    }
];

let db;
let productsCollection;
let ordersCollection;
let usersCollection;
let mongoClient;

// ==========================================
// ROUTES
// ==========================================

// 1. Welcome route / Storefront
app.get("/", (req, res) => {
    // When opened in a web browser, serve the store frontend index.html
    if (req.accepts("html")) {
        return res.sendFile(path.join(__dirname, "index.html"));
    }
    // For command-line tests or plain text clients, return status message
    res.send("KannanStore backend is working!");
});

// Status check route
app.get("/status", (req, res) => {
    res.send("KannanStore backend is working!");
});

// 2. Hello test route
app.get("/hello", (req, res) => {
    res.send("Hello Kannan! Your backend is responding.");
});

// 3. GET /products - Fetch all products from MongoDB Atlas
app.get("/products", async (req, res) => {
    try {
        if (!productsCollection) {
            return res.status(503).json({
                error: "Database not connected yet. Please try again shortly."
            });
        }

        // Fetch all documents from the 'products' collection
        const products = await productsCollection.find({}).toArray();
        res.json(products);
    } catch (error) {
        // Safe logging: log error message without exposing credentials
        console.error("Error retrieving products:", error.message);
        res.status(500).json({ error: "Failed to retrieve products from database." });
    }
});

// 4. GET /products/:id - Fetch a single product by numeric id or MongoDB _id
app.get("/products/:id", async (req, res) => {
    try {
        if (!productsCollection) {
            return res.status(503).json({
                error: "Database not connected yet. Please try again shortly."
            });
        }

        const { id } = req.params;
        let query;

        // Check if the id is a 24-character hexadecimal MongoDB ObjectId
        if (ObjectId.isValid(id) && id.length === 24) {
            query = { $or: [{ _id: new ObjectId(id) }, { id: Number(id) }] };
        } else if (!isNaN(Number(id))) {
            query = { id: Number(id) };
        } else {
            // Validation failed: ID is neither numeric nor 24-char ObjectId
            return res.status(400).json({
                error: "Invalid product ID format. Please provide a numeric ID or a 24-character MongoDB ObjectId."
            });
        }

        const product = await productsCollection.findOne(query);

        // If no product matched the query, return a clear 404 response
        if (!product) {
            return res.status(404).json({
                error: `Product with ID '${id}' not found.`
            });
        }

        res.json(product);
    } catch (error) {
        console.error("Error retrieving product by ID:", error.message);
        res.status(500).json({ error: "Failed to retrieve product from database." });
    }
});

// 5. POST /orders - Place a new order and persist in MongoDB Atlas
app.post("/orders", async (req, res) => {
    try {
        if (!ordersCollection || !productsCollection) {
            return res.status(503).json({
                error: "Database not connected yet. Please try again shortly."
            });
        }

        const { customer, items } = req.body || {};

        // A. Validate customer details
        if (!customer || typeof customer !== "object") {
            return res.status(400).json({
                error: "Customer details are required."
            });
        }

        const name = typeof customer.name === "string" ? customer.name.trim() : "";
        const email = typeof customer.email === "string" ? customer.email.trim() : "";
        const phone = typeof customer.phone === "string" ? customer.phone.trim() : "";
        const address = typeof customer.address === "string" ? customer.address.trim() : "";

        if (!name || name.length < 2) {
            return res.status(400).json({
                error: "Please provide a valid customer name (at least 2 characters)."
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({
                error: "Please provide a valid email address."
            });
        }

        if (!phone || phone.length < 7 || phone.length > 20) {
            return res.status(400).json({
                error: "Please provide a valid phone number (at least 7 digits)."
            });
        }

        if (!address || address.length < 5) {
            return res.status(400).json({
                error: "Please provide a valid delivery address (at least 5 characters)."
            });
        }

        // B. Validate cart items array
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: "Your cart is empty. Please add at least one product to place an order."
            });
        }

        // C. Fetch each product from MongoDB Atlas to verify official name and price
        // Client-submitted prices and totals are completely ignored for security
        const verifiedItems = [];
        let totalAmount = 0;

        for (const item of items) {
            const rawId = item.productId ?? item.id;
            const quantity = Number(item.quantity);

            if (!rawId) {
                return res.status(400).json({
                    error: "Each item must have a valid product identifier (id or productId)."
                });
            }

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({
                    error: "Item quantity must be a positive integer."
                });
            }

            if (quantity > 100) {
                return res.status(400).json({
                    error: "Item quantity exceeds the maximum allowable limit (100) per order."
                });
            }

            // Build query matching either 24-char ObjectId or numeric id
            let query;
            const idStr = String(rawId);
            if (ObjectId.isValid(idStr) && idStr.length === 24) {
                query = { $or: [{ _id: new ObjectId(idStr) }, { id: Number(idStr) }] };
            } else if (!isNaN(Number(idStr))) {
                query = { id: Number(idStr) };
            } else {
                return res.status(400).json({
                    error: `Invalid product ID format '${rawId}'.`
                });
            }

            const dbProduct = await productsCollection.findOne(query);

            if (!dbProduct) {
                return res.status(404).json({
                    error: `Product with ID '${rawId}' was not found in the store catalog.`
                });
            }

            const unitPrice = Number(dbProduct.price) || 0;
            const itemTotal = unitPrice * quantity;
            totalAmount += itemTotal;

            verifiedItems.push({
                productId: dbProduct.id ?? dbProduct._id.toString(),
                name: dbProduct.name,
                price: unitPrice,
                quantity: quantity,
                itemTotal: itemTotal
            });
        }

        // D. Construct the verified order document
        // Optional user association (guest checkout continues working 100%)
        let authenticatedUserId = null;
        let token = req.cookies?.token;
        if (!token && req.headers.authorization) {
            const parts = req.headers.authorization.split(" ");
            if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
                token = parts[1];
            }
        }
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                authenticatedUserId = decoded.userId;
            } catch {
                // Ignore invalid token for guest checkout
            }
        }

        const orderDocument = {
            customer: {
                name,
                email: email.toLowerCase(),
                phone,
                address
            },
            items: verifiedItems,
            total: totalAmount,
            status: "confirmed",
            paymentMethod: "demo_checkout",
            createdAt: new Date(),
            ...(authenticatedUserId ? { userId: authenticatedUserId } : {})
        };

        // E. Save order in MongoDB orders collection
        const insertResult = await ordersCollection.insertOne(orderDocument);

        console.log(`Order placed successfully! Order ID: ${insertResult.insertedId} | Items: ${verifiedItems.length} | Total: ₹${totalAmount}`);

        // Return order confirmation
        return res.status(201).json({
            success: true,
            message: "Order placed and confirmed successfully!",
            orderId: insertResult.insertedId,
            order: {
                id: insertResult.insertedId,
                customer: {
                    name: orderDocument.customer.name,
                    email: orderDocument.customer.email
                },
                items: verifiedItems,
                total: totalAmount,
                status: orderDocument.status,
                createdAt: orderDocument.createdAt
            }
        });
    } catch (error) {
        console.error("Error creating order:", error.message);
        return res.status(500).json({
            error: "Failed to place order due to a server error. Please try again."
        });
    }
});

// 6. GET /orders/:id - Fetch an order by its MongoDB ObjectId
app.get("/orders/:id", async (req, res) => {
    try {
        if (!ordersCollection) {
            return res.status(503).json({
                error: "Database not connected yet. Please try again shortly."
            });
        }

        const { id } = req.params;
        if (!ObjectId.isValid(id) || id.length !== 24) {
            return res.status(400).json({
                error: "Invalid order ID format. Expected a 24-character MongoDB ObjectId."
            });
        }

        const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
        if (!order) {
            return res.status(404).json({
                error: `Order with ID '${id}' not found.`
            });
        }

        res.json(order);
    } catch (error) {
        console.error("Error retrieving order:", error.message);
        res.status(500).json({ error: "Failed to retrieve order." });
    }
});

// ==========================================
// AUTHENTICATION HELPERS & MIDDLEWARE
// ==========================================

function getAuthCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
}

function authenticateToken(req, res, next) {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(" ");
        if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
            token = parts[1];
        }
    }

    if (!token) {
        return res.status(401).json({
            error: "Authentication required. Please log in."
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            error: "Invalid or expired session. Please log in again."
        });
    }
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// 7. POST /auth/register - Register a new user account
app.post("/auth/register", async (req, res) => {
    try {
        if (!usersCollection) {
            return res.status(503).json({
                error: "Database not connected yet. Please try again shortly."
            });
        }

        const { name, email, password } = req.body || {};

        // Validation & Normalization
        if (typeof name !== "string" || name.trim().length < 2) {
            return res.status(400).json({
                error: "Please provide a valid full name (at least 2 characters)."
            });
        }
        if (name.trim().length > 60) {
            return res.status(400).json({
                error: "Full name cannot exceed 60 characters."
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof email !== "string" || !emailRegex.test(email.trim())) {
            return res.status(400).json({
                error: "Please provide a valid email address."
            });
        }
        if (email.trim().length > 120) {
            return res.status(400).json({
                error: "Email address cannot exceed 120 characters."
            });
        }

        if (typeof password !== "string" || password.length < 6) {
            return res.status(400).json({
                error: "Password must be at least 6 characters long."
            });
        }
        if (password.length > 100) {
            return res.status(400).json({
                error: "Password cannot exceed 100 characters."
            });
        }

        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        // Check if an account already exists with this normalized email
        const existingUser = await usersCollection.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(409).json({
                error: "An account with this email address already exists."
            });
        }

        // Secure password hashing using bcrypt
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const newUser = {
            name: normalizedName,
            email: normalizedEmail,
            passwordHash: passwordHash,
            createdAt: new Date()
        };

        let insertResult;
        try {
            insertResult = await usersCollection.insertOne(newUser);
        } catch (dbErr) {
            // Handle unique index duplicate key error safely
            if (dbErr.code === 11000 || (dbErr.message && dbErr.message.includes("E11000"))) {
                return res.status(409).json({
                    error: "An account with this email address already exists."
                });
            }
            throw dbErr;
        }

        // Issue JWT token and set secure HttpOnly cookie
        const token = jwt.sign(
            { userId: insertResult.insertedId.toString(), email: normalizedEmail, name: normalizedName },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.cookie("token", token, getAuthCookieOptions());

        // Return user info WITHOUT exposing passwordHash
        return res.status(201).json({
            success: true,
            message: "Account registered successfully!",
            user: {
                id: insertResult.insertedId,
                name: normalizedName,
                email: normalizedEmail,
                createdAt: newUser.createdAt
            },
            token: token
        });
    } catch (error) {
        console.error("Error during registration:", error.message);
        return res.status(500).json({
            error: "Failed to register account due to a server error. Please try again."
        });
    }
});

// 8. POST /auth/login - Authenticate user credentials
app.post("/auth/login", async (req, res) => {
    try {
        if (!usersCollection) {
            return res.status(503).json({
                error: "Database not connected yet. Please try again shortly."
            });
        }

        const { email, password } = req.body || {};

        if (!email || !password || typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({
                error: "Email and password are required."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Find user by normalized email
        const user = await usersCollection.findOne({ email: normalizedEmail });

        // Generic error response that prevents account enumeration
        if (!user || !user.passwordHash) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // Secure bcrypt password verification
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // Issue JWT token and set secure HttpOnly cookie
        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.cookie("token", token, getAuthCookieOptions());

        return res.json({
            success: true,
            message: "Login successful!",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt
            },
            token: token
        });
    } catch (error) {
        console.error("Error during login:", error.message);
        return res.status(500).json({
            error: "Failed to log in due to a server error. Please try again."
        });
    }
});

// 9. POST /auth/logout - Clear session cookie
app.post("/auth/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    });
    return res.json({
        success: true,
        message: "Logged out successfully."
    });
});

// 10. GET /auth/me - Protected route to verify active session
app.get("/auth/me", authenticateToken, async (req, res) => {
    try {
        if (!usersCollection) {
            return res.status(503).json({
                error: "Database not connected yet. Please try again shortly."
            });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
        if (!user) {
            return res.status(404).json({
                error: "User account not found."
            });
        }

        return res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error("Error retrieving authenticated user:", error.message);
        return res.status(500).json({
            error: "Failed to retrieve user profile."
        });
    }
});

// ==========================================
// DATABASE CONNECTION & SEEDING
// ==========================================

async function connectDB() {
    const mongoUri = process.env.MONGODB_URI?.trim();
    if (!mongoUri) {
        console.error(
            "MongoDB connection skipped: MONGODB_URI is missing. Add your Atlas connection string to .env."
        );
        return false;
    }

    try {
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();

        console.log("MongoDB connected successfully!");

        // Access the 'kannanstore' database
        db = mongoClient.db("kannanstore");
        console.log("Database ready:", db.databaseName);

        // Access or create the 'products', 'orders', and 'users' collections
        productsCollection = db.collection("products");
        ordersCollection = db.collection("orders");
        usersCollection = db.collection("users");

        // Ensure unique index on email in users collection
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        console.log("Users collection initialized with unique email index.");

        // Insert initial products ONLY if they do not already exist
        // This avoids duplicate entries whenever the server restarts
        let insertedCount = 0;
        for (const product of initialProducts) {
            const exists = await productsCollection.findOne({ name: product.name });
            if (!exists) {
                await productsCollection.insertOne(product);
                insertedCount++;
                console.log(`Seeded new product: ${product.name}`);
            }
        }

        const totalCount = await productsCollection.countDocuments();
        if (insertedCount === 0) {
            console.log(`Database ready: all initial products exist (${totalCount} total in collection). Skipping duplicate seed.`);
        } else {
            console.log(`Database seeded: added ${insertedCount} product(s). (${totalCount} total in collection).`);
        }

        return true;
    } catch (error) {
        // Safe logging: never expose passwords or connection URI
        console.error(
            "MongoDB connection failed. Check the Atlas URI, network access, and database user credentials."
        );
        console.error("Error type:", error.name);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        return false;
    }
}

// Start the server after initiating the database connection
async function startServer() {
    await connectDB();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { app, connectDB, startServer };
